import { storage } from "../src/shared/storage";
import { UNKNOWN_TOOL_NAME } from "../src/shared/browser-tools";
import { getMessages } from "../src/shared/i18n";
import {
  clampMaxToolSteps,
  GENERATED_TITLE_MAX_CJK_CHARS,
  GENERATED_TITLE_MAX_LENGTH,
  GENERATED_TITLE_MAX_WORDS,
  ISO_DATE_LENGTH,
  MODEL_TEMPERATURE,
  QUICK_ACTION_SOURCE_MAX_CHARS,
  QUICK_ACTION_TITLE_MAX_LENGTH,
  STREAM_CHUNK_DELAY_MS,
} from "../src/shared/config";
import {
  AI_STREAM_PORT_NAME,
  AI_STREAM_REQUEST_TYPE,
  AI_TEXT_CHUNK_TYPE,
  CHAT_PART_STATE,
  isToolPartType,
  isAskMode,
  toolNameFromPartType,
  type AiStreamRequest,
  type AiStreamResponse,
  type ChatMessage,
  type ChatMode,
  type GenerateQuickActionRequest,
  type GenerateTitleRequest,
  type ProviderId,
  type QuickAction,
  type SendMessagesRequest,
} from "../src/shared/types";
import { requestOpenAICompatible } from "../src/background/providers";
import { resolveModel } from "../src/background/model-resolver";
import { chunkText } from "../src/background/message-helpers";

const SIDE_PANEL_OPENED = "side_panel_opened";
export default defineBackground(() => {
  chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    .catch(console.warn);

  chrome.action.onClicked.addListener(() => {
    capture(SIDE_PANEL_OPENED).catch(console.warn);
  });

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "update")
      storage.shouldShowUpdateToast.set(true).catch(console.warn);
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== AI_STREAM_PORT_NAME) return;

    let abortController: AbortController | undefined;

    port.onMessage.addListener((request: AiStreamRequest) => {
      if (request.type === AI_STREAM_REQUEST_TYPE.abort) {
        abortController?.abort();
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.sendMessages) {
        abortController?.abort();
        abortController = new AbortController();
        streamAssistantResponse(port, request, abortController.signal).catch(
          (error) => {
            if (error?.name === "AbortError") return;
            post(port, {
              type: "error",
              error: error?.message || String(error),
            });
          },
        );
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.generateTitle) {
        generateTitle(request)
          .then((title) => post(port, { type: "title", title }))
          .catch(() => post(port, { type: "title", title: "New Chat" }));
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.generateQuickAction) {
        generateQuickAction(request)
          .then((quickAction) =>
            post(port, { type: "quickAction", quickAction }),
          )
          .catch((error) =>
            post(port, {
              type: "error",
              error: error?.message || String(error),
            }),
          );
      }
    });

    port.onDisconnect.addListener(() => abortController?.abort());
  });
});

async function capture(event: string) {
  await chrome.runtime
    .sendMessage({ type: "proxy-service.TrackerService", event })
    .catch(() => undefined);
}

function post(port: chrome.runtime.Port, message: AiStreamResponse) {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post ai-stream message", error);
  }
}

async function streamAssistantResponse(
  port: chrome.runtime.Port,
  request: SendMessagesRequest,
  signal: AbortSignal,
) {
  const providerModel = await resolveModel(request.body.modelId);
  const t = getMessages(request.body.language);
  const system = createSystemPrompt(request.body.chatMode);
  const text = await requestOpenAICompatible(
    providerModel,
    system,
    request.messages,
    request.body.chatMode,
    clampMaxToolSteps(request.body.maxToolSteps),
    signal,
    port,
    request.messageId,
    t.sidepanel.attachmentsUnsupportedRetry,
    request.body.context?.uploadedAttachments || [],
  );

  if (text) {
    post(port, {
      type: "chunk",
      chunk: {
        type: AI_TEXT_CHUNK_TYPE.textStart,
        id: request.messageId || crypto.randomUUID(),
      },
    });
    for (const delta of chunkText(text)) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      post(port, {
        type: "chunk",
        chunk: {
          type: AI_TEXT_CHUNK_TYPE.textDelta,
          id: request.messageId,
          delta,
        },
      });
      await new Promise((resolve) =>
        setTimeout(resolve, STREAM_CHUNK_DELAY_MS),
      );
    }
    post(port, {
      type: "chunk",
      chunk: { type: AI_TEXT_CHUNK_TYPE.textEnd, id: request.messageId },
    });
  }
  post(port, { type: "end" });
}

function createSystemPrompt(mode: ChatMode) {
  if (isAskMode(mode)) {
    return `You are OpenBrowserAgent, an AI created by OpenBrowserAgent.

Your job is to answer the USER's question based on the content USER might provide.

You MUST respond in the same language as the USER's latest non-internal message. If the latest non-internal message mixes languages, follow the user's dominant language and preserve any quoted text as written.`;
  }
  return `You are OpenBrowserAgent, an AI created by OpenBrowserAgent.
You act like a human that co-work with USER in browser. Finishing USER's task that USER want to finish in browser. You have many tools to interact with the browser.

Your job is to understand USER's task, execute the task in a human-like way, and display a task report to the USER.

You MUST follow the core_workflow to do the task.

You MUST follow the tool call schema exactly as specified and make sure to provide all necessary parameters. And follow the output description to decide the next step.

You MUST respond in the same language as the USER's latest non-internal message. If the latest non-internal message mixes languages, follow the user's dominant language and preserve any quoted text as written.

<rules_must_follow>
- NEVER use your internal knowledge to imagine an URL to open directly.
</rules_must_follow>

<continuous_execution_protocol>
- Your task is NOT complete after a single tool call. You must continue executing tools until the overall goal is achieved.
- After every tool call, you MUST perform the following check:
    1.  **Analyze the result:** Review the output from the last tool.
    2.  **Evaluate task completion:** Ask yourself, "Have I gathered all the information needed to fulfill the USER's original request?"
    3.  **Decide the next action:**
        -   **If the task is NOT yet complete:** You MUST determine the next logical tool to use. Briefly inform the user of your immediate next step (e.g., "Next, I will click the login button.", "Okay, now reading the main content."), and then immediately call the next tool.
        -   **If the task IS complete:** Stop calling tools and provide the final task report.
</continuous_execution_protocol>

<communication_guide>
- All thinking and response should be in USER speaking language.
- You should explain the plan before every step.
- AI ID is used to locate the element in the browser, it cannot be shown to the USER, so NEVER mention AI ID in your response, tool call or result. For example, if you want to click an element, you should say "click the element" instead of "click the element with ai-id <ai-id>". When you found a element, you should say "found the element" instead of "found the element with ai-id <ai-id>".
- NEVER mention the tool name in your response.
</communication_guide>

<capabilities>
- You can use tools to interact with the browser.
- Interact with the browser in a human-like way.
- Before clicking and inputing, you should use findAccessableElementsFromTab tool to find the element you want to interact with.
</capabilities>

<core_workflow>
- When you receive a task, have a deep think and break it down into multiple steps as human would do in browser. For example, use clickElementByAiID tool to click element to gather more information.
- Tell USER the plan's details you gonna do
- Follow the web_search_strategy if the task is about to do searching or research on web.
- NO need to ask USER for confirmation to begin the task.
</core_workflow>

<web_search_strategy>
- Act as a diligent and intelligent research assistant. Your goal is not just to find an answer, but to find the best, most reliable answer by comparing multiple sources.
- DO NOT directly read the content of search page content, try to use clickElementByAiID tool to click the search result and get the content of the search result page.
- Deconstruct the Topic: When given a research task, first break it down. Identify the primary keywords and potential search queries. Sometimes USER's query is not clear, you need to try to understand the USER's intent and break it down into multiple keywords. Then you can do multiple searchs.
- NO need to response the summary of the search results while doing the research. In this phase, the main goal is to gather information and consume the information for the final task report.
- When you complete the a search task, you MUST use groupTabs tool to group the tabs you opened. Do NOT close the tabs you opened. After groupTabs succeeds, do not call more tools; provide the final task report.
</web_search_strategy>`;
}

async function generateTitle(request: GenerateTitleRequest) {
  const fallback = compactTitle(request.message) || "New Chat";
  try {
    const model = await resolveModel(request.modelId);
    const raw = await requestPlainText(model, [
      {
        role: "system",
        content:
          "Create concise chat titles. Return only the title, no quotes, no punctuation wrapper, no explanation.",
      },
      {
        role: "user",
        content: `Summarize this chat starter into a title in the same language as the message.

Rules:
- Maximum 10 English words, or maximum 10 CJK characters for Chinese/Japanese/Korean.
- No trailing period.
- Return the title only.

Message:
${request.message}`,
      },
    ]);
    return compactTitle(raw) || fallback;
  } catch {
    return fallback;
  }
}

function compactTitle(value: string) {
  const title = value
    .replace(/[\r\n]+/g, " ")
    .replace(/^[[({"'“‘`\s]+|[\])}"'”’`\s.。!！?？:：]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return "";
  if (/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(title))
    return title.replace(/\s+/g, "").slice(0, GENERATED_TITLE_MAX_CJK_CHARS);
  return title
    .split(/\s+/)
    .slice(0, GENERATED_TITLE_MAX_WORDS)
    .join(" ")
    .slice(0, GENERATED_TITLE_MAX_LENGTH);
}

async function generateQuickAction(
  request: GenerateQuickActionRequest,
): Promise<QuickAction> {
  const model = await resolveModel(request.modelId);
  const source = renderQuickActionSource(request.messages).slice(
    0,
    QUICK_ACTION_SOURCE_MAX_CHARS,
  );
  const prompt = `Create a reusable quick action from this browser-agent chat.

Return JSON only with this shape:
{"title":"short name","instruction":"reusable instruction"}

Rules:
- Generalize the workflow so it can be reused later.
- Do not copy one-off facts, personal names, URLs, or results unless they are essential to the reusable workflow.
- The instruction should tell the browser agent what to do, not describe what already happened.
- Preserve useful variables such as {{ date }} if appropriate.
- Title must be concise.

<chat>
${source}
</chat>`;
  const raw = await requestPlainText(model, [
    {
      role: "system",
      content:
        "You create concise reusable browser-agent quick actions. Return valid JSON only.",
    },
    { role: "user", content: prompt },
  ]);
  const parsed = parseJsonObject(raw) as Partial<QuickAction>;
  const title = String(parsed.title || "Quick Action")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, QUICK_ACTION_TITLE_MAX_LENGTH);
  const instruction = String(parsed.instruction || "").trim();
  if (!instruction) throw new Error("The model did not create an instruction.");
  return {
    id: crypto.randomUUID(),
    title: title || "Quick Action",
    instruction,
  };
}

async function requestPlainText(
  model: {
    provider: ProviderId;
    apiKey: string;
    baseUrl: string;
    modelName: string;
  },
  messages: Array<{ role: "system" | "user"; content: string }>,
) {
  if (model.provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.modelName)}:generateContent?key=${encodeURIComponent(model.apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: messages[0]?.content || "" }] },
        contents: messages.slice(1).map((message) => ({
          role: "user",
          parts: [{ text: message.content }],
        })),
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return (
      data.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("") || ""
    );
  }

  const baseUrl = model.baseUrl.replace(/\/$/, "");
  const chatUrl =
    model.provider === "ollama"
      ? `${baseUrl}/v1/chat/completions`
      : `${baseUrl}/chat/completions`;
  const response = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: model.modelName,
      temperature: MODEL_TEMPERATURE,
      messages,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function renderQuickActionSource(messages: ChatMessage[]) {
  return messages
    .map((message) => {
      const parts = (message.parts || [])
        .filter((part) => isToolPartType(part.type))
        .map((part) => {
          const toolName = isToolPartType(part.type)
            ? part.toolName || toolNameFromPartType(part.type)
            : part.toolName;
          return [
            `tool=${toolName}`,
            `state=${part.state || UNKNOWN_TOOL_NAME}`,
            part.input ? `input=${safeStringify(part.input)}` : undefined,
            part.output ? `output=${safeStringify(part.output)}` : undefined,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n");
      return [`role=${message.role}`, message.content, parts]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");
}

function parseJsonObject(value: string) {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The model did not return JSON.");
  return JSON.parse(match[0]);
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

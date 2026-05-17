import { storage } from "../src/shared/storage";
import JSZip from "jszip";
import {
  BROWSER_TOOL_TIMEOUT_MS,
  clampMaxToolSteps,
  GENERATED_TITLE_MAX_LENGTH,
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_FILENAME_MAX_LABEL_LENGTH,
  MARKDOWN_FILENAME_MAX_LENGTH,
  MAX_IMAGES_PER_DOWNLOAD,
  MODEL_TEMPERATURE,
  STREAM_CHUNK_DELAY_MS,
} from "../src/shared/config";
import {
  providerDefaultBaseUrls,
  type AiStreamRequest,
  type AiStreamResponse,
  type ChatMessage,
  type ChatMode,
  type ProviderId,
} from "../src/shared/types";

const PORT_AI_STREAM = "ai-stream";
const SIDE_PANEL_OPENED = "side_panel_opened";
const FINAL_AFTER_GROUP_TABS_INSTRUCTION =
  "<internal_instruction>The browser tabs have been grouped successfully. The browser work is complete. Do not call more tools. Provide the final task report now, using the gathered information and responding in the same language as the user's latest non-internal message.</internal_instruction>";

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
    if (port.name !== PORT_AI_STREAM) return;

    let abortController: AbortController | undefined;

    port.onMessage.addListener((request: AiStreamRequest) => {
      if (request.type === "abort") {
        abortController?.abort();
        return;
      }

      if (request.type === "sendMessages") {
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

      if (request.type === "generateTitle") {
        generateTitle(request.message).then((title) =>
          post(port, { type: "title", title }),
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
  request: Extract<AiStreamRequest, { type: "sendMessages" }>,
  signal: AbortSignal,
) {
  const providerModel = await resolveModel(request.body.modelId);
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
  );

  if (text) {
    post(port, {
      type: "chunk",
      chunk: {
        type: "text-start",
        id: request.messageId || crypto.randomUUID(),
      },
    });
    for (const delta of chunkText(text)) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      post(port, {
        type: "chunk",
        chunk: { type: "text-delta", id: request.messageId, delta },
      });
      await new Promise((resolve) =>
        setTimeout(resolve, STREAM_CHUNK_DELAY_MS),
      );
    }
    post(port, {
      type: "chunk",
      chunk: { type: "text-end", id: request.messageId },
    });
  }
  post(port, { type: "end" });
}

async function resolveModel(modelId?: string) {
  const providers = await storage.provider.get();
  const preferences = await storage.preferences.get();
  const selectedModelId = modelId || preferences.selectedModelId;

  for (const [provider, config] of Object.entries(providers) as Array<
    [ProviderId, NonNullable<(typeof providers)[ProviderId]>]
  >) {
    const model = config.models?.find(
      (candidate) =>
        candidate.id === selectedModelId || candidate.name === selectedModelId,
    );
    if (model) {
      return {
        provider,
        apiKey: config.apiKey || "",
        baseUrl: config.baseUrl || providerDefaultBaseUrls[provider] || "",
        modelName: model.name || model.id,
      };
    }
  }

  const fallbackProvider = Object.entries(providers)[0] as
    | [ProviderId, NonNullable<(typeof providers)[ProviderId]>]
    | undefined;
  const fallbackModel = fallbackProvider?.[1].models?.[0];
  if (fallbackProvider && fallbackModel) {
    return {
      provider: fallbackProvider[0],
      apiKey: fallbackProvider[1].apiKey || "",
      baseUrl:
        fallbackProvider[1].baseUrl ||
        providerDefaultBaseUrls[fallbackProvider[0]] ||
        "",
      modelName: fallbackModel.name || fallbackModel.id,
    };
  }

  throw new Error("No model configured. Add an AI provider in Settings.");
}

async function requestOpenAICompatible(
  model: {
    provider: ProviderId;
    apiKey: string;
    baseUrl: string;
    modelName: string;
  },
  system: string,
  messages: ChatMessage[],
  mode: ChatMode,
  maxToolSteps: number,
  signal: AbortSignal,
  port: chrome.runtime.Port,
  messageId?: string,
) {
  if (model.provider === "gemini") {
    return requestGemini(
      model,
      system,
      messages,
      mode,
      maxToolSteps,
      signal,
      port,
    );
  }

  const baseUrl = model.baseUrl.replace(/\/$/, "");
  const chatUrl =
    model.provider === "ollama"
      ? `${baseUrl}/v1/chat/completions`
      : `${baseUrl}/chat/completions`;
  const requestMessages: Array<Record<string, unknown>> = [
    { role: "system", content: system },
    ...messages.map((message, index) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content:
        index === messages.length - 1 && message.role === "user"
          ? renderUserMessageWithContext(message)
          : message.content,
    })),
  ];

  if (mode === "Ask" || maxToolSteps <= 0) {
    const response = await fetch(chatUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: model.modelName,
        temperature: MODEL_TEMPERATURE,
        messages: requestMessages,
        stream: true,
      }),
    });

    if (!response.ok) throw new Error(await response.text());
    await readOpenAIStream(response, port, signal, messageId);
    return "";
  }

  for (let step = 0; step < maxToolSteps; step++) {
    const response = await fetch(chatUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: model.modelName,
        temperature: MODEL_TEMPERATURE,
        messages: requestMessages,
        stream: true,
        tools: browserTools,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) throw new Error(await response.text());
    const streamResult = await readOpenAIStream(
      response,
      port,
      signal,
      step === 0 ? messageId : undefined,
      true,
    );
    const toolCalls = streamResult.toolCalls;
    if (!toolCalls.length) return "";

    requestMessages.push({
      role: "assistant",
      content: streamResult.content || null,
      tool_calls: toolCalls,
    });
    let groupedTabsSuccessfully = false;
    for (const toolCall of toolCalls) {
      const toolName = String(toolCall.function?.name || "unknown");
      const toolCallId = String(toolCall.id || crypto.randomUUID());
      const input = parseToolArgs(toolCall.function?.arguments);
      post(port, {
        type: "chunk",
        chunk: {
          type: `tool-${toolName}`,
          toolCallId,
          toolName,
          state: "input-available",
          input,
        },
      });
      const output = await safeExecuteBrowserTool(toolName, input);
      const hasError = isToolError(output);
      if (toolName === "groupTabs" && isToolSuccess(output))
        groupedTabsSuccessfully = true;
      post(port, {
        type: "chunk",
        chunk: {
          type: `tool-${toolName}`,
          toolCallId,
          toolName,
          state: hasError ? "output-error" : "output-available",
          input,
          output,
        },
      });
      requestMessages.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: JSON.stringify(output),
      });
    }
    if (groupedTabsSuccessfully) {
      requestMessages.push({
        role: "user",
        content: FINAL_AFTER_GROUP_TABS_INSTRUCTION,
      });
      const finalResponse = await fetch(chatUrl, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: model.modelName,
          temperature: MODEL_TEMPERATURE,
          messages: requestMessages,
          stream: true,
        }),
      });
      if (!finalResponse.ok) throw new Error(await finalResponse.text());
      await readOpenAIStream(finalResponse, port, signal);
      return "";
    }
  }

  requestMessages.push({
    role: "user",
    content:
      "<internal_instruction>Maximum browser tool steps reached. Do not call more tools. Summarize the findings and clearly state what is known, what remains uncertain, and the best next step for the user. Respond in the same language as the user's latest non-internal message.</internal_instruction>",
  });

  const fallbackResponse = await fetch(chatUrl, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: model.modelName,
      temperature: MODEL_TEMPERATURE,
      messages: requestMessages,
      stream: true,
    }),
  });

  if (!fallbackResponse.ok) throw new Error(await fallbackResponse.text());
  await readOpenAIStream(fallbackResponse, port, signal);
  return "";
}

async function readOpenAIStream(
  response: Response,
  port: chrome.runtime.Port,
  signal: AbortSignal,
  preferredTextId?: string,
  deferTextUntilNoTools = false,
) {
  if (!response.body) throw new Error("Streaming response body is empty");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls: Array<{
    id?: string;
    type?: string;
    function: { name?: string; arguments?: string };
  }> = [];
  const textId = preferredTextId || crypto.randomUUID();
  const announcedToolIndexes = new Set<number>();
  let buffer = "";
  let content = "";
  let textStarted = false;
  let deferredTextPosted = false;

  function emitText(delta: string) {
    if (!delta) return;
    if (deferTextUntilNoTools) {
      content += delta;
      return;
    }
    if (!textStarted) {
      textStarted = true;
      post(port, { type: "chunk", chunk: { type: "text-start", id: textId } });
    }
    content += delta;
    post(port, {
      type: "chunk",
      chunk: { type: "text-delta", id: textId, delta },
    });
  }

  function postDeferredTextNote() {
    if (!deferTextUntilNoTools || deferredTextPosted || !content) return;
    deferredTextPosted = true;
    postText(port, content, textId, signal, false);
  }

  function consumeEvent(rawEvent: string) {
    const data = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;

    const payload = JSON.parse(data) as {
      choices?: Array<{
        delta?: {
          content?: string;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };
    const delta = payload.choices?.[0]?.delta;
    emitText(delta?.content || "");

    for (const toolDelta of delta?.tool_calls || []) {
      const index = toolDelta.index ?? toolCalls.length;
      const current = toolCalls[index] || { function: {} };
      toolCalls[index] = {
        ...current,
        id: toolDelta.id || current.id,
        type: toolDelta.type || current.type || "function",
        function: {
          name: toolDelta.function?.name || current.function.name,
          arguments: `${current.function.arguments || ""}${toolDelta.function?.arguments || ""}`,
        },
      };

      const next = toolCalls[index];
      if (!announcedToolIndexes.has(index) && next.id && next.function.name) {
        announcedToolIndexes.add(index);
        postDeferredTextNote();
        post(port, {
          type: "chunk",
          chunk: {
            type: `tool-${next.function.name}`,
            toolCallId: next.id,
            toolName: next.function.name,
            state: "input-streaming",
            input: {},
          },
        });
      }
    }
  }

  while (true) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const event of events) consumeEvent(event);
  }

  buffer += decoder.decode();
  if (buffer.trim()) consumeEvent(buffer);
  if (textStarted)
    post(port, { type: "chunk", chunk: { type: "text-end", id: textId } });

  const completeToolCalls = toolCalls.filter(
    (toolCall) => toolCall.function.name,
  );
  if (deferTextUntilNoTools && content) {
    if (completeToolCalls.length && !deferredTextPosted)
      postText(port, content, textId, signal, false);
    if (!completeToolCalls.length) postText(port, content, textId, signal);
  }

  return {
    content,
    toolCalls: completeToolCalls,
  };
}

async function requestGemini(
  model: { apiKey: string; modelName: string },
  system: string,
  messages: ChatMessage[],
  mode: ChatMode,
  maxToolSteps: number,
  signal: AbortSignal,
  port: chrome.runtime.Port,
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.modelName)}:generateContent?key=${encodeURIComponent(model.apiKey)}`;
  const contents: Array<Record<string, unknown>> = messages.map(
    (message, index) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            index === messages.length - 1 && message.role === "user"
              ? renderUserMessageWithContext(message)
              : message.content,
        },
      ],
    }),
  );
  const useTools = mode !== "Ask" && maxToolSteps > 0;

  if (!useTools) {
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
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

  for (let step = 0; step < maxToolSteps; step++) {
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        ...(useTools
          ? {
              tools: [
                {
                  functionDeclarations: browserTools.map(
                    (item) => item.function,
                  ),
                },
              ],
            }
          : {}),
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts
      .map(
        (part: {
          functionCall?: { name?: string; args?: Record<string, unknown> };
        }) => part.functionCall,
      )
      .filter(Boolean);
    if (!functionCalls.length)
      return (
        parts.map((part: { text?: string }) => part.text || "").join("") || ""
      );

    const textBeforeTools = parts
      .map((part: { text?: string }) => part.text || "")
      .join("");
    if (textBeforeTools)
      postText(port, textBeforeTools, crypto.randomUUID(), signal, false);

    contents.push({ role: "model", parts });
    const responseParts = [];
    let groupedTabsSuccessfully = false;
    for (const functionCall of functionCalls) {
      const toolName = String(functionCall.name || "unknown");
      const toolCallId = crypto.randomUUID();
      const input = functionCall.args || {};
      post(port, {
        type: "chunk",
        chunk: {
          type: `tool-${toolName}`,
          toolCallId,
          toolName,
          state: "input-available",
          input,
        },
      });
      const output = await safeExecuteBrowserTool(toolName, input);
      const hasError = isToolError(output);
      if (toolName === "groupTabs" && isToolSuccess(output))
        groupedTabsSuccessfully = true;
      post(port, {
        type: "chunk",
        chunk: {
          type: `tool-${toolName}`,
          toolCallId,
          toolName,
          state: hasError ? "output-error" : "output-available",
          input,
          output,
        },
      });
      responseParts.push({
        functionResponse: { name: toolName, response: output },
      });
    }
    contents.push({ role: "user", parts: responseParts });
    if (groupedTabsSuccessfully) {
      contents.push({
        role: "user",
        parts: [{ text: FINAL_AFTER_GROUP_TABS_INSTRUCTION }],
      });
      const finalResponse = await fetch(url, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
        }),
      });
      if (!finalResponse.ok) throw new Error(await finalResponse.text());
      const finalData = await finalResponse.json();
      return (
        finalData.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text || "")
          .join("") || ""
      );
    }
  }

  contents.push({
    role: "user",
    parts: [
      {
        text: "<internal_instruction>Maximum browser tool steps reached. Do not call more tools. Summarize the findings and clearly state what is known, what remains uncertain, and the best next step for the user. Respond in the same language as the user's latest non-internal message.</internal_instruction>",
      },
    ],
  });
  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
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

function postText(
  port: chrome.runtime.Port,
  text: string,
  id: string,
  signal: AbortSignal,
  appendToMessageContent = true,
) {
  const prefix = appendToMessageContent ? "text" : "text-note";
  post(port, { type: "chunk", chunk: { type: `${prefix}-start`, id } });
  for (const delta of chunkText(text)) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    post(port, {
      type: "chunk",
      chunk: { type: `${prefix}-delta`, id, delta },
    });
  }
  post(port, { type: "chunk", chunk: { type: `${prefix}-end`, id } });
}

function createSystemPrompt(mode: ChatMode) {
  if (mode === "Ask") {
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

async function generateTitle(message: string) {
  const title = message
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GENERATED_TITLE_MAX_LENGTH);
  return title || "New Chat";
}

function chunkText(text: string) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += 24)
    chunks.push(text.slice(index, index + 24));
  return chunks;
}

function parseToolArgs(value: string | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function renderUserMessageWithContext(message: ChatMessage) {
  if (message.metadata?.internalRetry) {
    return `<internal_instruction>
${message.content}
</internal_instruction>`;
  }

  const context =
    typeof message.metadata?.context === "string"
      ? message.metadata.context
      : "";
  const quickAction = message.metadata?.quickAction as
    | { instruction?: string }
    | undefined;
  return `${
    quickAction?.instruction
      ? `<instruction>
${quickAction.instruction}
</instruction>

`
      : ""
  }<message_context>

${context}

</message_context>${
    quickAction?.instruction
      ? ""
      : `

<message>
${message.content}
</message>`
  }`;
}

const browserTools = [
  tool("openNewTabWithURL", "Open a new tab with the given URL", {
    url: { type: "string", description: "The URL to open in a new tab" },
    reason: {
      type: "string",
      description:
        "The reason to open the new tab. It should be relevant to the USER's query. SHOULD use USER's language.",
    },
  }),
  tool("getCurrentTab", "Get current active tab", {}),
  tool("goToTab", "Go to a tab by ID", {
    tabId: { type: "number", description: "The ID of the tab to go to" },
  }),
  tool("insertCSSToTab", "Insert CSS to a tab", {
    tabId: {
      type: "number",
      description: "The ID of the tab to insert CSS to",
    },
    css: { type: "string", description: "The CSS to insert" },
  }),
  tool("removeCSSToTab", "Remove CSS from a tab", {
    tabId: {
      type: "number",
      description: "The ID of the tab to remove CSS from",
    },
    css: { type: "string", description: "The CSS to remove" },
  }),
  tool("getTabContent", "Get the markdown content of a list of tabs", {
    tabIds: {
      type: "array",
      items: { type: "number" },
      description: "The IDs of the tabs to get the content of",
    },
  }),
  tool("getAllTabs", "Get all tabs", {}),
  tool("closeTab", "Close tabs by ID", {
    tabIds: {
      type: "array",
      items: { type: "number" },
      description: "The IDs of the tabs to close",
    },
  }),
  tool("openSearchTab", "Open a search tab with the given query", {
    query: { type: "string", description: "The search query" },
  }),
  tool("waitTabLoadFinished", "Wait for a tab to finish loading", {
    tabId: { type: "number", description: "The ID of the tab to wait for" },
  }),
  tool("clickElementByAiID", "Click an element by its AI ID", {
    id: { type: "string", description: "The ID of the element to click" },
    tabId: {
      type: "number",
      description: "The ID of the tab to click the element in",
    },
  }),
  tool("inputTextByAiID", "Input text into an element by its AI ID", {
    id: {
      type: "string",
      description: "The ID of the element to input text into",
    },
    tabId: {
      type: "number",
      description: "The ID of the tab to input text into",
    },
    text: { type: "string", description: "The text to input into the element" },
  }),
  tool(
    "findAccessableElementsFromTab",
    "Find all accessible elements from a tab",
    {
      tabId: {
        type: "number",
        description: "The ID of the tab to find accessible elements from",
      },
    },
  ),
  tool("getElementPropertiesByAiID", "Get element properties by AI ID", {
    tabId: {
      type: "number",
      description: "The ID of the tab that the elements are in",
    },
    ids: {
      type: "array",
      items: { type: "string" },
      description: "The ai-ids of the elements",
    },
  }),
  tool(
    "groupTabs",
    "Group tabs with title and optional color",
    {
      tabIds: {
        type: "array",
        items: { type: "number" },
        description: "The IDs of the tabs to group",
      },
      title: { type: "string", description: "The title of the tab group" },
      color: { type: "string", description: "The color of the tab group" },
    },
    ["tabIds", "title"],
  ),
  tool("scrollToBottom", "Scroll to the bottom of a tab", {
    tabId: { type: "number", description: "The ID of the tab to scroll" },
  }),
  tool("downloadTabToMarkdown", "Download a tab to markdown", {
    tabId: { type: "number", description: "The ID of the tab to download" },
  }),
  tool("downloadAllImagesInTab", "Download all images in a tab", {
    tabId: {
      type: "number",
      description: "The ID of the tab to download images from",
    },
  }),
];

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
      },
    },
  };
}

async function executeBrowserTool(
  name: string | undefined,
  args: Record<string, unknown>,
) {
  switch (name) {
    case "getCurrentTab": {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab) return { error: "NEED_PAGE_CONTENT_ACCESS_PERMISSION" };
      return tab.url?.startsWith("http")
        ? { tabId: tab.id, title: tab.title, url: tab.url }
        : { error: "Not a web page" };
    }
    case "openNewTabWithURL": {
      const tab = await chrome.tabs.create({ url: String(args.url || "") });
      if (tab.id) {
        await waitTabComplete(tab.id);
        const loadedTab = await chrome.tabs.get(tab.id);
        return {
          tab: { id: loadedTab.id, url: loadedTab.url, title: loadedTab.title },
        };
      }
      return { tab: { id: tab.id } };
    }
    case "getAllTabs": {
      const tabs = await chrome.tabs.query({});
      return tabs.map((tab) => ({ id: tab.id, title: tab.title }));
    }
    case "closeTab": {
      const tabIds = Array.isArray(args.tabIds)
        ? args.tabIds.map(Number).filter(Number.isFinite)
        : [Number(args.tabId)].filter(Number.isFinite);
      if (!tabIds.length)
        return { success: false, error: "No tab IDs provided" };
      await chrome.tabs.remove(tabIds);
      return { success: true, tabIds };
    }
    case "goToTab": {
      const tab = await chrome.tabs.update(await resolveTabId(args.tabId), {
        active: true,
      });
      if (!tab) return { success: false, error: "Tab not found" };
      if (tab.windowId !== undefined)
        await chrome.windows.update(tab.windowId, { focused: true });
      return { success: true };
    }
    case "insertCSSToTab": {
      await chrome.scripting.insertCSS({
        target: { tabId: await resolveTabId(args.tabId) },
        css: String(args.css || ""),
      });
      return { success: true };
    }
    case "removeCSSToTab": {
      await chrome.scripting.removeCSS({
        target: { tabId: await resolveTabId(args.tabId) },
        css: String(args.css || ""),
      });
      return { success: true };
    }
    case "openSearchTab": {
      const query = String(args.query || "");
      const tab = await chrome.tabs.create({ active: true });
      if (tab.id && chrome.search?.query)
        await chrome.search.query({ tabId: tab.id, text: query });
      else if (tab.id)
        await chrome.tabs.update(tab.id, {
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        });
      return { success: true, tabId: tab.id };
    }
    case "waitTabLoadFinished": {
      const tabId = await resolveTabId(args.tabId);
      await waitTabComplete(tabId);
      return { success: true, tabId };
    }
    case "getTabContent": {
      const tabIds = Array.isArray(args.tabIds)
        ? args.tabIds
            .map(Number)
            .filter((tabId) => Number.isFinite(tabId) && tabId > 0)
        : [await resolveTabId(args.tabId)];
      const contents = [];
      for (const tabId of tabIds) {
        const tab = await chrome.tabs.get(tabId);
        const markdown = await extractMarkdown(tabId);
        contents.push({
          tabId,
          title: tab.title || "",
          url: tab.url || "",
          markdown,
        });
      }
      return { contents };
    }
    case "findAccessableElementsFromTab": {
      return {
        elements: await findAccessibleElements(await resolveTabId(args.tabId)),
      };
    }
    case "getElementPropertiesByAiID": {
      const ids = Array.isArray(args.ids)
        ? args.ids.map(String)
        : [String(args.id || "")].filter(Boolean);
      return getElementProperties(await resolveTabId(args.tabId), ids);
    }
    case "clickElementByAiID": {
      return clickElement(
        await resolveTabId(args.tabId),
        String(args.id || ""),
      );
    }
    case "inputTextByAiID": {
      return inputElement(
        await resolveTabId(args.tabId),
        String(args.id || ""),
        String(args.text || ""),
      );
    }
    case "groupTabs": {
      const tabIds = Array.isArray(args.tabIds)
        ? args.tabIds.map(Number).filter(Number.isFinite)
        : [];
      if (!tabIds.length)
        return { success: false, error: "No tab IDs provided" };
      const groupId = await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
      });
      const color = String(
        args.color || "cyan",
      ) as chrome.tabGroups.UpdateProperties["color"];
      const title = String(args.title || "");
      await chrome.tabGroups.update(groupId, { title, color });
      return { success: true, groupId };
    }
    case "scrollToBottom": {
      await scrollToBottom(await resolveTabId(args.tabId));
      return { success: true };
    }
    case "downloadTabToMarkdown": {
      const tabId = await resolveTabId(args.tabId);
      const tab = await chrome.tabs.get(tabId);
      const markdown = await extractMarkdown(tabId);
      const filename = `${safeFileName(tab.title || tab.url || "tab").slice(0, MARKDOWN_FILENAME_MAX_LENGTH)}.md`;
      await downloadTextFile(filename, markdown, "text/markdown;charset=utf-8");
      return { success: true, filename };
    }
    case "downloadAllImagesInTab": {
      return findImages(await resolveTabId(args.tabId));
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function safeExecuteBrowserTool(
  name: string | undefined,
  args: Record<string, unknown>,
) {
  try {
    return await withTimeout(
      executeBrowserTool(name, args),
      BROWSER_TOOL_TIMEOUT_MS,
      `Tool timed out: ${name || "unknown"}`,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function isToolError(output: unknown) {
  return typeof output === "object" && output !== null && "error" in output;
}

function isToolSuccess(output: unknown) {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as { success?: unknown }).success === true &&
    !("error" in output)
  );
}

function pickTab(tab: chrome.tabs.Tab) {
  return { id: tab.id, title: tab.title, url: tab.url };
}

async function resolveTabId(value: unknown) {
  const tabId = Number(value);
  if (Number.isFinite(tabId) && tabId > 0) return tabId;
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!activeTab?.id) throw new Error("No active tab available");
  return activeTab.id;
}

async function extractMarkdown(tabId: number) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () =>
      `# ${document.title}\n\nURL: ${location.href}\n\n${document.body?.innerText || ""}`,
  });
  return String(result.result || "");
}

async function findAccessibleElements(tabId: number) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const selectors =
        'a, button, input, textarea, img, [contenteditable="true"], [aria-label]';
      const elements: Array<{
        type: string;
        id: string;
        properties: Record<string, unknown>;
      }> = [];
      Array.from(document.querySelectorAll(selectors)).forEach((element) => {
        const htmlElement = element as
          | HTMLAnchorElement
          | HTMLImageElement
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLElement;
        const tag = htmlElement.tagName.toLowerCase();
        const style = getComputedStyle(htmlElement);
        if (
          style.display === "none" ||
          tag === "img" ||
          (tag === "a" &&
            (!(htmlElement as HTMLAnchorElement).href ||
              /^(javascript:|mailto:|tel:|data:|blob:|about:|chrome:|#)/i.test(
                (htmlElement as HTMLAnchorElement).href,
              ))) ||
          (tag === "input" &&
            (htmlElement as HTMLInputElement).type === "hidden")
        ) {
          return;
        }
        if (htmlElement.getAttribute("data-ai-id")) return;

        const id = `ai-id-${Math.random().toString(36).substring(2, 8)}`;
        htmlElement.setAttribute("data-ai-id", id);
        let type =
          (
            {
              img: "image",
              a: "link",
              button: "button",
              textarea: "textarea",
              input: "input",
            } as Record<string, string>
          )[tag] || tag;
        if (htmlElement.hasAttribute("contenteditable"))
          type = "contentEditable";

        const properties: Record<string, unknown> = {};
        if (type === "button")
          properties.buttonType = (htmlElement as HTMLButtonElement).type;
        if (type === "input") {
          const input = htmlElement as HTMLInputElement;
          if (input.type) properties.inputType = input.type;
          if (input.placeholder) properties.placeholder = input.placeholder;
        }
        const ariaLabel = htmlElement.getAttribute("aria-label");
        if (ariaLabel) properties.ariaLabel = ariaLabel;
        else if (type === "image")
          properties.alt = (htmlElement as HTMLImageElement).alt || "";
        const role = htmlElement.getAttribute("role");
        if (role) properties.role = role;
        if (type === "input" || type === "textarea")
          properties.value = (
            htmlElement as HTMLInputElement | HTMLTextAreaElement
          ).value;
        else if (type === "contentEditable")
          properties.value = htmlElement.innerHTML;
        if (type === "link") properties.content = htmlElement.textContent;
        else if (type === "image")
          properties.alt = (htmlElement as HTMLImageElement).alt;
        elements.push({ type, id, properties });
      });
      return elements;
    },
  });
  return result.result || [];
}

async function getElementProperties(tabId: number, ids: string[]) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [ids],
    func: (aiIds) => {
      return aiIds.map((aiId) => {
        const element = document.querySelector(`[data-ai-id="${aiId}"]`) as
          | HTMLAnchorElement
          | HTMLImageElement
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        if (!element) return null;
        const properties: Record<string, unknown> = {
          aiId: element.getAttribute("data-ai-id"),
        };
        if (element.tagName.toLowerCase() === "img")
          properties.src = (element as HTMLImageElement).src;
        else if (element.tagName.toLowerCase() === "a")
          properties.href = (element as HTMLAnchorElement).href;
        else if (
          element.tagName.toLowerCase() === "input" ||
          element.tagName.toLowerCase() === "textarea"
        )
          properties.value = (
            element as HTMLInputElement | HTMLTextAreaElement
          ).value;
        return properties;
      });
    },
  });
  return result.result ?? [];
}

async function clickElement(tabId: number, id: string) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [id],
    func: (aiId) => {
      const element = document.querySelector(`[data-ai-id="${aiId}"]`) as
        | HTMLAnchorElement
        | HTMLElement
        | null;
      if (!element) return { isNewTab: false, notFound: true };
      if (
        element.tagName === "A" &&
        (element as HTMLAnchorElement).getAttribute("href")
      ) {
        const href = (element as HTMLAnchorElement).getAttribute("href");
        return {
          isNewTab: true,
          url: href
            ? new URL(href, window.location.origin).href
            : (element as HTMLAnchorElement).href,
        };
      }
      element.click();
      return { isNewTab: false };
    },
  });
  const output = result.result as
    | { isNewTab?: boolean; notFound?: boolean; url?: string }
    | undefined;
  if (output?.isNewTab && output.url) {
    const tab = await chrome.tabs.create({ url: output.url });
    return { success: true, tabId: tab.id, shouldWaitTabLoadFinished: true };
  }
  return { success: !output?.notFound, tabId };
}

async function inputElement(tabId: number, id: string, text: string) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [id, text],
    func: (aiId, value) => {
      const element = document.querySelector(
        `[data-ai-id="${CSS.escape(aiId)}"]`,
      ) as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
      if (!element) return { success: false };
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        (element as HTMLInputElement | HTMLTextAreaElement).value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return { success: true };
      }
      if (element.hasAttribute("contenteditable")) {
        element.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand("delete", false);
        if (!document.execCommand("insertText", false, value)) {
          element.textContent = value;
          const endRange = document.createRange();
          endRange.selectNodeContents(element);
          endRange.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(endRange);
        }
        for (const eventName of [
          "input",
          "change",
          "keydown",
          "keyup",
          "keypress",
          "textInput",
          "compositionend",
          "blur",
        ]) {
          let event: Event;
          if (eventName.startsWith("key"))
            event = new KeyboardEvent(eventName, {
              bubbles: true,
              cancelable: true,
              key: "Unidentified",
              code: "Unidentified",
            });
          else if (eventName === "textInput")
            event = new CompositionEvent(eventName, {
              bubbles: true,
              data: value,
            });
          else event = new Event(eventName, { bubbles: true });
          element.dispatchEvent(event);
        }
        const inputEvent = new Event("input", { bubbles: true });
        Object.defineProperty(inputEvent, "target", { value: element });
        Object.defineProperty(inputEvent, "currentTarget", { value: element });
        element.dispatchEvent(inputEvent);
        return { success: true };
      }
      return {
        success: false,
        error: "Element is not an input, textarea, or contenteditable",
      };
    },
  });
  return { ...(result.result || { success: false }), tabId };
}

async function scrollToBottom(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      window.scrollTo({ top: scrollHeight, behavior: "smooth" });
      return { scrollHeight };
    },
  });
}

async function findImages(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const seen = new Set<string>();
      const images: Array<{
        src: string;
        alt: string;
        index: number;
        type: string;
      }> = [];
      let index = 0;
      for (const img of Array.from(document.querySelectorAll("img"))) {
        if (
          !img.src ||
          !img.src.startsWith("http") ||
          img.src.startsWith("data:") ||
          img.src.startsWith("blob:") ||
          !img.complete ||
          img.naturalWidth <= 0 ||
          img.naturalHeight <= 0 ||
          seen.has(img.src)
        )
          continue;
        seen.add(img.src);
        images.push({
          src: img.src,
          alt: img.alt || `img-${index}`,
          index: index++,
          type: "img",
        });
      }
      const selectors = [
        "div",
        "section",
        "header",
        "footer",
        "article",
        "aside",
        "main",
        ".hero",
        ".banner",
        ".background",
        ".cover",
        ".image",
        '[style*="background"]',
        '[class*="bg-"]',
        '[class*="background"]',
      ];
      for (const element of Array.from(
        document.querySelectorAll(selectors.join(",")),
      ) as HTMLElement[]) {
        const backgroundImage = getComputedStyle(element).backgroundImage;
        const match = backgroundImage?.match(/url\(['"]?([^'"]*?)['"]?\)/);
        if (!match?.[1]) continue;
        let src = match[1];
        if (src.startsWith("/")) src = window.location.origin + src;
        else if (!src.startsWith("http"))
          src = new URL(src, window.location.href).href;
        if (src.startsWith("data:") || src.startsWith("blob:") || seen.has(src))
          continue;
        seen.add(src);
        const label =
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.classList[0] ||
          element.tagName.toLowerCase();
        images.push({
          src,
          alt: `bg-${label}-${index}`.slice(0, IMAGE_ALT_MAX_LENGTH),
          index: index++,
          type: "background",
        });
      }
      return images;
    },
  });
  const images = result.result || [];
  const filename = `${safeFileName(tab.title || tab.url || "tab")}_images.zip`;
  const zip = new JSZip();
  let downloadedCount = 0;
  for (const image of images.slice(0, MAX_IMAGES_PER_DOWNLOAD)) {
    try {
      const response = await fetch(image.src);
      if (!response.ok) continue;
      const blob = await response.blob();
      const extension = imageExtension(
        response.headers.get("content-type"),
        image.src,
      );
      zip.file(
        `${String(image.index + 1).padStart(3, "0")}_${safeFileName(image.alt || image.type || "image").slice(0, IMAGE_FILENAME_MAX_LABEL_LENGTH)}.${extension}`,
        blob,
      );
      downloadedCount += 1;
    } catch {
      // Some sites block image fetches; keep going and zip the images we can access.
    }
  }
  if (downloadedCount > 0) {
    const base64 = await zip.generateAsync({ type: "base64" });
    await chrome.downloads.download({
      url: `data:application/zip;base64,${base64}`,
      filename,
      saveAs: false,
    });
  }
  return {
    success: downloadedCount > 0,
    totalFound: images.length,
    downloadedCount,
    filename,
  };
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
}

async function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
) {
  await chrome.downloads.download({
    url: `data:${mimeType},${encodeURIComponent(content)}`,
    filename,
    saveAs: false,
  });
}

function imageExtension(contentType: string | null, url: string) {
  const fromType = contentType
    ?.split("/")[1]
    ?.split(";")[0]
    ?.replace("jpeg", "jpg")
    .replace("svg+xml", "svg");
  if (fromType && /^[a-z0-9]+$/i.test(fromType)) return fromType;
  const match = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1] || "jpg";
}

async function waitTabComplete(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") return;
  await new Promise<void>((resolve) => {
    const listener = (
      changedTabId: number,
      changeInfo: { status?: string },
    ) => {
      if (changedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

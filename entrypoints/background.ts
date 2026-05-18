import { storage } from "../src/shared/storage";
import { UNKNOWN_TOOL_NAME } from "../src/shared/browser-tools";
import { getMessages } from "../src/shared/i18n";
import { createSkillPackage, normalizeSkillName } from "../src/shared/skills";
import { createSystemPrompt } from "../src/shared/system-prompt";
import {
  clampMaxToolSteps,
  GENERATED_TITLE_MAX_CJK_CHARS,
  GENERATED_TITLE_MAX_LENGTH,
  GENERATED_TITLE_MAX_WORDS,
  ISO_DATE_LENGTH,
  MODEL_TEMPERATURE,
  SKILL_SOURCE_MAX_CHARS,
  SKILL_NAME_MAX_LENGTH,
  STREAM_CHUNK_DELAY_MS,
} from "../src/shared/config";
import {
  AI_STREAM_PORT_NAME,
  AI_STREAM_REQUEST_TYPE,
  AI_TEXT_CHUNK_TYPE,
  CHAT_PART_STATE,
  isToolPartType,
  toolNameFromPartType,
  type AiStreamRequest,
  type AiStreamResponse,
  type ChatMessage,
  type ChatMode,
  type GenerateSkillRequest,
  type GenerateTitleRequest,
  type ProviderId,
  type Skill,
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

      if (request.type === AI_STREAM_REQUEST_TYPE.generateSkill) {
        generateSkill(request)
          .then((skill) => post(port, { type: "skill", skill }))
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
    request.body.context?.autoSelectSkills
      ? request.body.context.availableSkills || []
      : [],
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

async function generateSkill(request: GenerateSkillRequest): Promise<Skill> {
  const model = await resolveModel(request.modelId);
  const source = renderSkillSource(request.messages).slice(
    0,
    SKILL_SOURCE_MAX_CHARS,
  );
  const prompt = `Create a reusable skill from this browser-agent chat.

Return JSON only with this shape:
{"name":"kebab-case-name","description":"one sentence","instruction":"reusable instruction"}

Rules:
- Generalize the workflow so it can be reused later.
- Do not copy one-off facts, personal names, URLs, or results unless they are essential to the reusable workflow.
- The instruction should tell the browser agent what to do, not describe what already happened.
- Preserve useful variables such as {{ date }} if appropriate.
- Name must be lowercase kebab-case and concise.

<chat>
${source}
</chat>`;
  const raw = await requestPlainText(model, [
    {
      role: "system",
      content:
        "You create concise reusable browser-agent skills. Return valid JSON only.",
    },
    { role: "user", content: prompt },
  ]);
  const parsed = parseJsonObject(raw) as Partial<Skill>;
  const name = normalizeSkillName(String(parsed.name || "skill"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SKILL_NAME_MAX_LENGTH);
  const instruction = String(
    (parsed.files?.find((file) => file.path === "SKILL.md")?.content ||
      (parsed as { instruction?: string }).instruction) ??
      "",
  ).trim();
  if (!instruction) throw new Error("The model did not create an instruction.");
  return createSkillPackage({
    name: name || "skill",
    description: String(parsed.description || "").trim(),
    instruction,
  });
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

function renderSkillSource(messages: ChatMessage[]) {
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

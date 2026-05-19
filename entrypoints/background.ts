import { storage } from "../src/shared/storage";
import { UNKNOWN_TOOL_NAME } from "../src/shared/browser-tools";
import { getMessages } from "../src/shared/i18n";
import {
  createSkillPackage,
  getSkillInstruction,
  normalizeSkillName,
} from "../src/shared/skills";
import { createSystemPrompt } from "../src/shared/system-prompt";
import {
  PROMPT_CONTEXT_TAG,
  PROMPT_CONTEXT_TAGS,
} from "../src/shared/prompt-breakdown";
import {
  clampMaxToolSteps,
  GENERATED_TITLE_MAX_CJK_CHARS,
  GENERATED_TITLE_MAX_LENGTH,
  GENERATED_TITLE_MAX_WORDS,
  ISO_DATE_LENGTH,
  MODEL_TEMPERATURE,
  SKILL_SOURCE_MAX_CHARS,
  SKILL_NAME_MAX_LENGTH,
} from "../src/shared/config";
import {
  AI_STREAM_PORT_NAME,
  AI_STREAM_REQUEST_TYPE,
  CHAT_PART_STATE,
  isToolPartType,
  toolNameFromPartType,
  type AiStreamRequest,
  type AiStreamResponse,
  type ChatMessage,
  type ChatMode,
  type ChatPart,
  type GenerateSkillRequest,
  type GenerateTitleRequest,
  type PromptBreakdown,
  type ProviderId,
  type Skill,
  type SendMessagesRequest,
} from "../src/shared/types";
import { requestOpenAICompatible } from "../src/background/providers";
import { resolveModel } from "../src/background/model-resolver";
import { postTextStream } from "../src/background/message-helpers";
import { browserToolsForPrompt } from "../src/background/tool-schema";

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
    let queuedMessages: Array<{ id: string; content: string }> = [];

    port.onMessage.addListener((request: AiStreamRequest) => {
      if (request.type === AI_STREAM_REQUEST_TYPE.abort) {
        abortController?.abort();
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.queueMessage) {
        const content = request.content.trim();
        if (content) queuedMessages.push({ id: request.id, content });
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.sendMessages) {
        abortController?.abort();
        queuedMessages = [];
        abortController = new AbortController();
        streamAssistantResponse(port, request, abortController.signal, () => {
          const messages = queuedMessages;
          queuedMessages = [];
          return messages;
        }).catch((error) => {
          if (error?.name === "AbortError") return;
          post(port, {
            type: "error",
            error: error?.message || String(error),
          });
        });
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
  drainQueuedMessages: () => Array<{ id: string; content: string }>,
) {
  const providerModel = await resolveModel(request.body.modelId);
  const t = getMessages(request.body.language);
  const system = createSystemPrompt(request.body.chatMode, {
    imageGenerationEnabled: !!request.body.context?.imageGenerationEnabled,
    agent: request.body.context?.agent,
  });
  const preferences = await storage.preferences.get();
  post(port, {
    type: "metrics",
    metrics: {
      promptBreakdown: promptBreakdown(
        system,
        request,
        !!preferences.cdpToolsEnabled,
        !!preferences.dangerousCodeExecutionEnabled,
      ),
    },
  });
  const result = await requestOpenAICompatible(
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
    drainQueuedMessages,
  );

  post(port, {
    type: "metrics",
    metrics: { outputMode: result.outputMode, usage: result.usage },
  });
  if (result.text)
    await postTextStream(
      port,
      result.text,
      request.messageId || crypto.randomUUID(),
      signal,
    );
  post(port, { type: "end" });
}

function promptBreakdown(
  system: string,
  request: SendMessagesRequest,
  cdpToolsEnabled: boolean,
  dangerousCodeExecutionEnabled: boolean,
): PromptBreakdown {
  const latestUser = [...request.messages]
    .reverse()
    .find((message) => message.role === "user");
  const attachments = request.body.context?.uploadedAttachments || [];
  const context = request.body.context?.text || "";
  const attachedTabs = latestUser?.metadata?.attachedTabs;
  const selectedElement = latestUser?.metadata?.selectedElement;
  const skill = latestUser?.metadata?.skill as Skill | undefined;
  const availableSkills = request.body.context?.availableSkills || [];
  return {
    systemPromptChars:
      system.length +
      jsonLength(
        browserToolsForPrompt({
          mode: request.body.chatMode,
          hasUploadedAttachments: attachments.length > 0,
          hasSkills: availableSkills.length > 0,
          imageGenerationEnabled:
            !!request.body.context?.imageGenerationEnabled,
          cdpToolsEnabled,
          dangerousCodeExecutionEnabled,
          latestUserText: latestUser?.content || "",
        }),
      ),
    userPromptChars: latestUser?.content.length || 0,
    conversationPromptChars: request.messages.reduce(
      (total, message) => total + message.content.length,
      0,
    ),
    tabPromptChars:
      contextBlockLength(context, PROMPT_CONTEXT_TAG.selectedTabs) +
      contextBlockLength(context, PROMPT_CONTEXT_TAG.currentTab) +
      metadataLength(attachedTabs),
    selectedElementPromptChars:
      contextBlockLength(context, PROMPT_CONTEXT_TAG.selectedElement) +
      metadataLength(selectedElement),
    skillPromptChars:
      (skill ? getSkillInstruction(skill).length : 0) +
      availableSkills.reduce(
        (total, item) => total + item.name.length + item.description.length,
        0,
      ),
    attachmentPromptChars: attachments.reduce(
      (total, attachment) =>
        total +
        attachment.name.length +
        (attachment.text?.length || 0) +
        (attachment.dataUrl?.length || 0),
      0,
    ),
    toolCallPromptChars: request.messages.reduce(
      (total, message) => total + toolCallChars(message.parts),
      0,
    ),
    sourcePromptChars: request.messages.reduce(
      (total, message) => total + metadataLength(message.metadata?.sources),
      0,
    ),
    otherContextPromptChars: otherContextChars(context),
  };
}

function contextBlockLength(context: string, tag: string) {
  const match = context.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g"));
  return match?.reduce((total, value) => total + value.length, 0) || 0;
}

function otherContextChars(context: string) {
  const known = PROMPT_CONTEXT_TAGS.reduce(
    (total, tag) => total + contextBlockLength(context, tag),
    0,
  );
  return Math.max(0, context.length - known);
}

function toolCallChars(parts: ChatPart[] | undefined) {
  if (!parts?.length) return 0;
  return parts.reduce((total, part) => {
    if (!isToolPartType(part.type)) return total;
    return (
      total +
      jsonLength(part.input) +
      jsonLength(part.output) +
      (part.toolName?.length || 0)
    );
  }, 0);
}

function metadataLength(value: unknown) {
  return jsonLength(value);
}

function jsonLength(value: unknown) {
  if (!value) return 0;
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
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

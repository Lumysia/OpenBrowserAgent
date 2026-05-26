import { getBrowserApi, storage } from "../src/shared/storage";
import { getMessages } from "../src/shared/i18n";
import {
  DEFAULT_AGENT_ID,
  usesWorkspaceCapabilities,
} from "../src/shared/agents";
import { getSkillInstruction } from "../src/shared/skills";
import { createSystemPrompt } from "../src/shared/system-prompt";
import {
  createWorkspace,
  ensureWorkspaceDefaults,
} from "../src/shared/workspace";
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
  type ChatPart,
  type GenerateTitleRequest,
  type PromptBreakdown,
  type ProviderId,
  type Skill,
  type SendMessagesRequest,
} from "../src/shared/types";
import { requestOpenAICompatible } from "../src/background/providers";
import { resolveModel } from "../src/background/model-resolver";
import { postTextStream } from "../src/background/message-helpers";
import { handleLocalExecutionBridgeRuntimeMessage } from "../src/background/local-execution-bridge-tools";
import { browserToolsForPrompt } from "../src/background/tool-schema";
import { requestOllamaPlainText } from "../src/background/ollama-provider";
import { openAIChatCompletionsUrl } from "../src/shared/provider-urls";
import { handleSyncBackendRuntimeMessage } from "../src/shared/sync-backends";
import "../src/shared/sync-backends-impl";
import * as streamSessions from "../src/background/stream-sessions";

const SIDE_PANEL_OPENED = "side_panel_opened";
const SIDE_PANEL_PAGE = "/sidepanel.html";

export default defineBackground(() => {
  chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    .catch(console.warn);

  const actionApi = chrome.action ?? chrome.browserAction;
  actionApi?.onClicked.addListener(() => {
    openActionSurface().catch(console.warn);
    capture(SIDE_PANEL_OPENED).catch(console.warn);
  });

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "update")
      storage.shouldShowUpdateToast.set(true).catch(console.warn);
  });

  chrome.runtime.onMessage.addListener(
    (message, _sender, sendResponse) =>
      handleSyncBackendRuntimeMessage(message, sendResponse) ||
      handleLocalExecutionBridgeRuntimeMessage(message, sendResponse),
  );

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== AI_STREAM_PORT_NAME) return;

    port.onMessage.addListener((request: AiStreamRequest) => {
      if (request.type === AI_STREAM_REQUEST_TYPE.abort) {
        streamSessions.abortPortStreams(port);
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.queueMessage) {
        const content = request.content.trim();
        const session = streamSessions.firstPortSession(port);
        if (content && session)
          streamSessions.queueMessage(session, { id: request.id, content });
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.deleteQueuedMessage) {
        const session = streamSessions.firstPortSession(port);
        if (session) streamSessions.deleteQueuedMessage(session, request.id);
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.answerQuestion) {
        const session = streamSessions.firstPortSession(port);
        if (session) streamSessions.sendMessageToSession(session, request);
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.attachStream) {
        const session = streamSessions.getStreamSession(request.chatId);
        if (!session) {
          post(port, { type: "end" });
          return;
        }
        streamSessions.attachPortToSession(
          port,
          session,
          request.afterSequence,
        );
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.sendMessages) {
        streamSessions.abortSession(request.chatId);
        const session = streamSessions.createStreamSession(request);
        streamSessions.attachPortToSession(port, session, undefined);
        const streamPort = streamSessions.streamSessionPort(session);
        streamAssistantResponse(
          streamPort,
          request,
          session.abortController.signal,
          () => streamSessions.drainQueuedMessages(session),
        )
          .catch((error) => {
            if (error?.name === "AbortError") return;
            streamSessions.postToSession(session, {
              type: "error",
              error: error?.message || String(error),
            });
          })
          .finally(() => streamSessions.scheduleSessionCleanup(session));
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.generateTitle) {
        generateTitle(request)
          .then((title) => post(port, { type: "title", title }))
          .catch(() => post(port, { type: "title", title: "New Chat" }));
      }
    });

    port.onDisconnect.addListener(() => streamSessions.detachPort(port));
  });
});

async function capture(event: string) {
  await getBrowserApi()
    .runtime.sendMessage({ type: "proxy-service.TrackerService", event })
    .catch(() => undefined);
}

async function openActionSurface() {
  const api = getBrowserApi() as typeof chrome & {
    sidebarAction?: { toggle?: () => Promise<void> };
  };
  if (api.sidePanel) return;

  const sidebarAction = api.sidebarAction;
  if (sidebarAction?.toggle) {
    await sidebarAction.toggle();
    return;
  }

  const sidePanelUrl = api.runtime.getURL(SIDE_PANEL_PAGE);
  const existing = (await api.tabs.query({})).find(
    (tab) => tab.url === sidePanelUrl,
  );
  if (existing?.id) {
    const tab = await api.tabs.update(existing.id, { active: true });
    if (tab?.windowId !== undefined)
      await api.windows.update(tab.windowId, { focused: true });
    return;
  }
  await api.tabs.create({ url: sidePanelUrl });
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
  const mcpServers = await storage.mcpServers.get();
  const capabilities = request.body.agentCapabilities;
  const workspace = usesWorkspaceCapabilities(capabilities)
    ? await workspaceForAgent(
        request.body.context?.agent?.id || DEFAULT_AGENT_ID,
      )
    : undefined;
  const system = createSystemPrompt({
    capabilities,
    imageGenerationEnabled: !!request.body.context?.imageGenerationEnabled,
    agent: request.body.context?.agent,
    workspace,
    mcpServers,
  });
  post(port, {
    type: "metrics",
    metrics: {
      promptBreakdown: promptBreakdown(system, request, !!workspace),
    },
  });
  const result = await requestOpenAICompatible(
    providerModel,
    system,
    request.messages,
    capabilities,
    clampMaxToolSteps(request.body.maxToolSteps),
    signal,
    port,
    request.chatId,
    request.messageId,
    t.sidepanel.attachmentsUnsupportedRetry,
    request.body.context?.uploadedAttachments || [],
    capabilities.skillTools ? request.body.context?.availableSkills || [] : [],
    mcpServers,
    workspace,
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
  hasWorkspace: boolean,
): PromptBreakdown {
  const latestUser = [...request.messages]
    .reverse()
    .find((message) => message.role === "user");
  const attachments = request.body.context?.uploadedAttachments || [];
  const context = request.body.context?.text || "";
  const attachedTabs = latestUser?.metadata?.attachedTabs;
  const selectedElements =
    latestUser?.metadata?.selectedElements ||
    latestUser?.metadata?.selectedElement;
  const selectedSkills = messageSkills(latestUser?.metadata);
  const availableSkills = request.body.context?.availableSkills || [];
  return {
    systemPromptChars:
      system.length +
      jsonLength(
        browserToolsForPrompt({
          capabilities: request.body.agentCapabilities,
          hasSkills: availableSkills.length > 0,
          hasWorkspace,
          imageGenerationEnabled:
            !!request.body.context?.imageGenerationEnabled,
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
      metadataLength(selectedElements),
    skillPromptChars:
      selectedSkills.reduce(
        (total, skill) => total + getSkillInstruction(skill).length,
        0,
      ) +
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

async function workspaceForAgent(agentId: string) {
  const agents = await storage.agents.get();
  const agent = agents.find((item) => item.id === agentId);
  const workspaces = await storage.agentWorkspaces.get();
  const existing = workspaces.find(
    (workspace) => workspace.agentId === agentId,
  );
  const workspace = ensureWorkspaceDefaults(
    existing || createWorkspace(agentId),
    agent,
  );
  if (!existing || existing.files.length !== workspace.files.length)
    await storage.agentWorkspaces.set(
      workspaces.filter((item) => item.agentId !== agentId).concat(workspace),
    );
  return workspace;
}

function messageSkills(metadata: Record<string, unknown> | undefined) {
  const skills = Array.isArray(metadata?.skills)
    ? (metadata.skills as Skill[])
    : [];
  const skill = metadata?.skill as Skill | undefined;
  return skills.length ? skills : skill ? [skill] : [];
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

  if (model.provider === "anthropic") {
    const baseUrl = model.baseUrl.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        ...(model.apiKey ? { "x-api-key": model.apiKey } : {}),
      },
      body: JSON.stringify({
        model: model.modelName,
        max_tokens: 512,
        system: messages[0]?.content || "",
        messages: messages.slice(1).map((message) => ({
          role: "user",
          content: [{ type: "text", text: message.content }],
        })),
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return anthropicText(data);
  }

  if (model.provider === "openai-responses") {
    const baseUrl = model.baseUrl.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: model.modelName,
        temperature: MODEL_TEMPERATURE,
        instructions: messages[0]?.content || "",
        input: messages.slice(1).map((message) => ({
          role: "user",
          content: [{ type: "input_text", text: message.content }],
        })),
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return responsesText(data);
  }

  if (model.provider === "ollama")
    return requestOllamaPlainText(model, messages);

  const chatUrl = openAIChatCompletionsUrl(model.baseUrl);
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

function responsesText(data: { output_text?: string; output?: unknown[] }) {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output || [])
    .flatMap((item) =>
      item && typeof item === "object"
        ? (item as { content?: unknown[] }).content || []
        : [],
    )
    .map((content) =>
      content &&
      typeof content === "object" &&
      typeof (content as Record<string, unknown>).text === "string"
        ? String((content as Record<string, unknown>).text)
        : "",
    )
    .join("");
}

function anthropicText(data: {
  content?: Array<{ type?: string; text?: string }>;
}) {
  return (data.content || [])
    .map((part) => (part.type === "text" ? part.text || "" : ""))
    .join("");
}

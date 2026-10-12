import { getBrowserApi, storage } from "../src/shared/storage";
import { getMessages } from "../src/shared/i18n";
import {
  DEFAULT_AGENT_ID,
  usesWorkspaceCapabilities,
} from "../src/shared/agents";
import { createSystemPrompt } from "../src/shared/system-prompt";
import {
  createWorkspace,
  ensureWorkspaceDefaults,
} from "../src/shared/workspace";
import {
  clampMaxToolSteps,
  GENERATED_TITLE_MAX_CJK_CHARS,
  GENERATED_TITLE_MAX_LENGTH,
  GENERATED_TITLE_MAX_WORDS,
  ISO_DATE_LENGTH,
} from "../src/shared/config";
import {
  AI_STREAM_PORT_NAME,
  AI_STREAM_REQUEST_TYPE,
  type AiStreamRequest,
  type AiStreamResponse,
  type GenerateTitleRequest,
  type SendMessagesRequest,
} from "../src/shared/types";
import { runPiAgent } from "../src/background/pi-runtime";
import {
  resolveHelperModel,
  resolveModel,
} from "../src/background/model-resolver";
import { handleLocalExecutionBridgeRuntimeMessage } from "../src/background/local-execution-bridge-tools";
import { requestText } from "../src/background/pi-provider";
import {
  handleSyncBackendRuntimeMessage,
  handleSyncBackendRuntimePort,
} from "../src/shared/sync-backends-runtime";
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
      streamSessions.handleChatStreamControlMessage(message, sendResponse) ||
      handleSyncBackendRuntimeMessage(message, sendResponse) ||
      handleLocalExecutionBridgeRuntimeMessage(message, sendResponse),
  );

  chrome.runtime.onConnect.addListener((port) => {
    if (handleSyncBackendRuntimePort(port)) return;
    if (port.name !== AI_STREAM_PORT_NAME) return;

    port.onMessage.addListener((request: AiStreamRequest) => {
      const session = streamSessions.getPortSession(port);
      if (request.type === AI_STREAM_REQUEST_TYPE.abort) {
        if (session) streamSessions.abortSession(session.chatId);
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.queueMessage) {
        const content = request.content.trim();
        if (content && session)
          streamSessions.queueMessage(session, { id: request.id, content });
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.deleteQueuedMessage) {
        if (session) streamSessions.deleteQueuedMessage(session, request.id);
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.answerQuestion) {
        if (session)
          streamSessions.answerQuestion(
            session,
            request.toolCallId,
            request.answers,
          );
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.attachStream) {
        const target = streamSessions.getStreamSession(request.chatId);
        if (!target) {
          streamSessions.post(port, { type: "end" });
          return;
        }
        streamSessions.attachPortToSession(port, target, request.afterSequence);
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.sendMessages) {
        const next = streamSessions.createStreamSession(request.chatId);
        streamSessions.attachPortToSession(port, next, undefined);
        streamAssistantResponse(next, request)
          .catch((error) => {
            if (error?.name === "AbortError") return;
            streamSessions.postToSession(next, {
              type: "error",
              error: error?.message || String(error),
            });
          })
          .finally(() => streamSessions.scheduleSessionCleanup(next));
        return;
      }

      if (request.type === AI_STREAM_REQUEST_TYPE.generateTitle) {
        generateTitle(request)
          .then((title) => streamSessions.post(port, { type: "title", title }))
          .catch(() =>
            streamSessions.post(port, { type: "title", title: "New Chat" }),
          );
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

async function streamAssistantResponse(
  session: streamSessions.StreamSession,
  request: SendMessagesRequest,
) {
  const post = (message: AiStreamResponse) =>
    streamSessions.postToSession(session, message);
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
  const preferences = await storage.preferences.get();
  await runPiAgent({
    session,
    model: providerModel,
    helperModel: await resolveHelperModel(
      preferences.helperModelId,
      providerModel,
    ),
    system,
    messages: request.messages,
    capabilities,
    maxToolSteps: clampMaxToolSteps(request.body.maxToolSteps),
    messageId: request.messageId,
    attachmentRetryNotice: t.sidepanel.attachmentsUnsupportedRetry,
    uploadedAttachments: request.body.context?.uploadedAttachments || [],
    availableSkills: capabilities.skillTools
      ? request.body.context?.availableSkills || []
      : [],
    mcpServers,
    workspace,
  });

  post({ type: "end" });
}

async function workspaceForAgent(agentId: string) {
  const agents = await storage.agents.get();
  const agent = agents.find((item) => item.id === agentId);
  const workspaces = await storage.agentWorkspaces.update((current) => {
    const existing = current.find((workspace) => workspace.agentId === agentId);
    const workspace = ensureWorkspaceDefaults(
      existing || createWorkspace(agentId),
      agent,
    );
    return !existing || existing.files.length !== workspace.files.length
      ? current.filter((item) => item.agentId !== agentId).concat(workspace)
      : current;
  });
  return workspaces.find((workspace) => workspace.agentId === agentId)!;
}

async function generateTitle(request: GenerateTitleRequest) {
  const fallback = compactTitle(request.message) || "New Chat";
  try {
    const model = await resolveModel(request.modelId);
    const { text: raw } = await requestText(model, {
      system:
        "Create concise chat titles. Return only the title, no quotes, no punctuation wrapper, no explanation.",
      prompt: `Summarize this chat starter into a title in the same language as the message.

Rules:
- Maximum 10 English words, or maximum 10 CJK characters for Chinese/Japanese/Korean.
- No trailing period.
- Return the title only.

Message:
${request.message}`,
    });
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

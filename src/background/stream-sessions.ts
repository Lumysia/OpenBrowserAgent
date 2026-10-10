import type {
  AiStreamRequest,
  AiStreamResponse,
  SendMessagesRequest,
} from "../shared/types";
import {
  ABORT_CHAT_STREAMS,
  type AbortChatStreamsResponse,
} from "../shared/chat-stream-control";
import {
  createSessionAgent,
  queueAgentMessage,
  deleteAgentQueuedMessage,
} from "./pi-session";

const STREAM_SESSION_RETENTION_MS = 5 * 60_000;

type StreamSession = {
  chatId: string;
  currentMessageId?: string;
  abortController: AbortController;
  events: AiStreamResponse[];
  nextSequence: number;
  ports: Set<chrome.runtime.Port>;
  messageListeners: Set<(message: AiStreamRequest) => void>;
  disconnectListeners: Set<() => void>;
  agent: ReturnType<typeof createSessionAgent>;
  cleanupTimeout?: ReturnType<typeof setTimeout>;
};

const activeStreamSessions = new Map<string, StreamSession>();
const portSessions = new WeakMap<chrome.runtime.Port, Set<StreamSession>>();

export function createStreamSession(request: SendMessagesRequest) {
  abortSession(request.chatId);
  const session: StreamSession = {
    chatId: request.chatId,
    currentMessageId: request.messageId,
    abortController: new AbortController(),
    events: [],
    nextSequence: 1,
    ports: new Set(),
    messageListeners: new Set(),
    disconnectListeners: new Set(),
    agent: createSessionAgent(),
  };
  activeStreamSessions.set(request.chatId, session);
  return session;
}

export function getStreamSession(chatId: string) {
  return activeStreamSessions.get(chatId);
}

export function streamSessionPort(session: StreamSession) {
  return {
    name: "ai-stream-session",
    postMessage: (message: AiStreamResponse) => postToSession(session, message),
    disconnect: () => {
      session.disconnectListeners.forEach((listener) => listener());
    },
    onMessage: {
      addListener: (listener: (message: AiStreamRequest) => void) => {
        session.messageListeners.add(listener);
      },
      removeListener: (listener: (message: AiStreamRequest) => void) => {
        session.messageListeners.delete(listener);
      },
    },
    onDisconnect: {
      addListener: (listener: () => void) => {
        session.disconnectListeners.add(listener);
      },
      removeListener: (listener: () => void) => {
        session.disconnectListeners.delete(listener);
      },
    },
  } as unknown as chrome.runtime.Port;
}

export function attachPortToSession(
  port: chrome.runtime.Port,
  session: StreamSession,
  afterSequence: number | undefined,
) {
  if (activeStreamSessions.get(session.chatId) !== session) return;
  session.ports.add(port);
  const sessions = portSessions.get(port) || new Set<StreamSession>();
  sessions.add(session);
  portSessions.set(port, sessions);
  session.events
    .filter((event) => !afterSequence || (event.sequence || 0) > afterSequence)
    .forEach((event) => post(port, event));
}

export function detachPort(port: chrome.runtime.Port) {
  const sessions = portSessions.get(port);
  if (!sessions) return;
  sessions.forEach((session) => session.ports.delete(port));
  portSessions.delete(port);
}

export function firstPortSession(port: chrome.runtime.Port) {
  return portSessions.get(port)?.values().next().value as
    StreamSession | undefined;
}

export function abortPortStreams(port: chrome.runtime.Port) {
  portSessions.get(port)?.forEach((session) => {
    if (activeStreamSessions.get(session.chatId) === session)
      abortSession(session.chatId);
  });
}

export function abortSession(chatId: string) {
  const session = activeStreamSessions.get(chatId);
  if (!session) return;
  session.abortController.abort();
  session.agent.abort();
  session.disconnectListeners.forEach((listener) => listener());
  releaseSession(session);
}

export function handleChatStreamControlMessage(
  message: unknown,
  sendResponse: (response: AbortChatStreamsResponse) => void,
) {
  if (
    !message ||
    typeof message !== "object" ||
    !("type" in message) ||
    message.type !== ABORT_CHAT_STREAMS
  )
    return false;
  if (
    !("chatIds" in message) ||
    !Array.isArray(message.chatIds) ||
    !message.chatIds.every((id) => typeof id === "string" && id.length > 0)
  ) {
    sendResponse({ ok: false, error: "Chat IDs are required." });
    return true;
  }
  // Snapshot identities before firing synchronous abort callbacks. Replacements
  // created during cancellation must not be picked up by later cleanup.
  const sessions = [...new Set(message.chatIds)].map((id) =>
    activeStreamSessions.get(id),
  );
  for (const session of sessions) {
    if (session && activeStreamSessions.get(session.chatId) === session)
      abortSession(session.chatId);
  }
  sendResponse({ ok: true });
  return true;
}

export function sendMessageToSession(
  session: StreamSession,
  message: AiStreamRequest,
) {
  session.messageListeners.forEach((listener) => listener(message));
}

export function queueMessage(
  session: StreamSession,
  message: { id: string; content: string },
) {
  queueAgentMessage(session.agent, message);
}

export function deleteQueuedMessage(session: StreamSession, id: string) {
  deleteAgentQueuedMessage(session.agent, id);
}

export function scheduleSessionCleanup(session: StreamSession) {
  if (
    activeStreamSessions.get(session.chatId) !== session ||
    session.cleanupTimeout
  )
    return;
  session.cleanupTimeout = setTimeout(
    () => releaseSession(session),
    STREAM_SESSION_RETENTION_MS,
  );
}

function releaseSession(session: StreamSession) {
  if (session.cleanupTimeout) clearTimeout(session.cleanupTimeout);
  if (activeStreamSessions.get(session.chatId) === session)
    activeStreamSessions.delete(session.chatId);
  for (const port of session.ports) {
    const attached = portSessions.get(port);
    attached?.delete(session);
    if (!attached?.size) portSessions.delete(port);
  }
  session.ports.clear();
  session.messageListeners.clear();
  session.disconnectListeners.clear();
  session.events.length = 0;
  session.agent.clearAllQueues();
}

export function postToSession(
  session: StreamSession,
  message: AiStreamResponse,
) {
  if (activeStreamSessions.get(session.chatId) !== session) return;
  const event = { ...message, sequence: session.nextSequence++ };
  if (message.type === "queuedMessages")
    session.currentMessageId = message.assistantMessageId;
  session.events.push(event);
  session.ports.forEach((port) => post(port, event));
}

function post(port: chrome.runtime.Port, message: AiStreamResponse) {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post ai-stream message", error);
  }
}

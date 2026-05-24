import type {
  AiStreamRequest,
  AiStreamResponse,
  SendMessagesRequest,
} from "../shared/types";

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
  queuedMessages: Array<{ id: string; content: string }>;
  cleanupTimeout?: ReturnType<typeof setTimeout>;
};

const activeStreamSessions = new Map<string, StreamSession>();
const portSessions = new WeakMap<chrome.runtime.Port, Set<StreamSession>>();

export function createStreamSession(request: SendMessagesRequest) {
  const session: StreamSession = {
    chatId: request.chatId,
    currentMessageId: request.messageId,
    abortController: new AbortController(),
    events: [],
    nextSequence: 1,
    ports: new Set(),
    messageListeners: new Set(),
    disconnectListeners: new Set(),
    queuedMessages: [],
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
  if (session.cleanupTimeout) clearTimeout(session.cleanupTimeout);
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
    | StreamSession
    | undefined;
}

export function abortPortStreams(port: chrome.runtime.Port) {
  portSessions.get(port)?.forEach((session) => abortSession(session.chatId));
}

export function abortSession(chatId: string) {
  const session = activeStreamSessions.get(chatId);
  if (!session) return;
  session.abortController.abort();
  session.disconnectListeners.forEach((listener) => listener());
  activeStreamSessions.delete(chatId);
}

export function sendMessageToSession(
  session: StreamSession,
  message: AiStreamRequest,
) {
  session.messageListeners.forEach((listener) => listener(message));
}

export function drainQueuedMessages(session: StreamSession) {
  const messages = session.queuedMessages;
  session.queuedMessages = [];
  return messages;
}

export function queueMessage(
  session: StreamSession,
  message: { id: string; content: string },
) {
  const index = session.queuedMessages.findIndex(
    (item) => item.id === message.id,
  );
  if (index >= 0) {
    session.queuedMessages[index] = message;
    return;
  }
  session.queuedMessages.push(message);
}

export function deleteQueuedMessage(session: StreamSession, id: string) {
  session.queuedMessages = session.queuedMessages.filter(
    (message) => message.id !== id,
  );
}

export function scheduleSessionCleanup(session: StreamSession) {
  session.cleanupTimeout = setTimeout(() => {
    if (activeStreamSessions.get(session.chatId) === session)
      activeStreamSessions.delete(session.chatId);
  }, STREAM_SESSION_RETENTION_MS);
}

export function postToSession(
  session: StreamSession,
  message: AiStreamResponse,
) {
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

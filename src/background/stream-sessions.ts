import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { UserMessage } from "@earendil-works/pi-ai";
import type { AiStreamResponse } from "../shared/types";
import {
  ABORT_CHAT_STREAMS,
  type AbortChatStreamsResponse,
} from "../shared/chat-stream-control";

const STREAM_SESSION_RETENTION_MS = 5 * 60_000;
const QUESTION_TIMEOUT_MS = 10 * 60_000;
const KEEPALIVE_INTERVAL_MS = 20_000;

export type QueuedUserMessage = UserMessage & { queueId: string };

export type StreamSession = {
  chatId: string;
  // The single cancellation route: runPiAgent forwards it to agent.abort(),
  // which aborts the provider request and every tool signal.
  abortController: AbortController;
  events: AiStreamResponse[];
  nextSequence: number;
  ports: Set<chrome.runtime.Port>;
  // In-process listeners, such as the background owner of a sub-agent chat.
  observers: Set<(event: AiStreamResponse) => void>;
  answers: Map<string, (answers: unknown) => void>;
  // Created with the session so messages queued before the run starts are
  // kept. runPiAgent installs the real model and stream function.
  agent: Agent;
  cleanupTimeout?: ReturnType<typeof setTimeout>;
};

const activeStreamSessions = new Map<string, StreamSession>();
// Each sidepanel port serves exactly one chat.
const portSessions = new WeakMap<chrome.runtime.Port, StreamSession>();
let keepalive: ReturnType<typeof setInterval> | undefined;

export function createStreamSession(chatId: string) {
  abortSession(chatId);
  const session: StreamSession = {
    chatId,
    abortController: new AbortController(),
    events: [],
    nextSequence: 1,
    ports: new Set(),
    observers: new Set(),
    answers: new Map(),
    agent: new Agent({
      streamFn: () => {
        throw new Error("The run has not configured a provider stream.");
      },
      steeringMode: "all",
      followUpMode: "all",
      // Tools that only read run concurrently; any other tool in a batch
      // makes the whole batch run in order (AgentTool.executionMode).
      toolExecution: "parallel",
    }),
  };
  activeStreamSessions.set(chatId, session);
  updateKeepalive();
  return session;
}

export function getStreamSession(chatId: string) {
  return activeStreamSessions.get(chatId);
}

export function getPortSession(port: chrome.runtime.Port) {
  return portSessions.get(port);
}

export function attachPortToSession(
  port: chrome.runtime.Port,
  session: StreamSession,
  afterSequence: number | undefined,
) {
  session.ports.add(port);
  portSessions.set(port, session);
  session.events
    .filter((event) => !afterSequence || (event.sequence || 0) > afterSequence)
    .forEach((event) => post(port, event));
}

// A panel reattaching to the run of a chat it found unfinished.
export function attachStream(
  port: chrome.runtime.Port,
  chatId: string,
  afterSequence: number | undefined,
) {
  const session = activeStreamSessions.get(chatId);
  if (!session) return post(port, { type: "notRunning" });
  attachPortToSession(port, session, afterSequence);
}

export function detachPort(port: chrome.runtime.Port) {
  portSessions.get(port)?.ports.delete(port);
  portSessions.delete(port);
}

export function abortSession(chatId: string) {
  const session = activeStreamSessions.get(chatId);
  if (!session) return;
  session.abortController.abort();
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
  message.chatIds.forEach(abortSession);
  sendResponse({ ok: true });
  return true;
}

// Resolves with the first answer that `parse` accepts; invalid answers keep
// the wait open. The wait survives panel reconnects and ends on abort.
export function waitForAnswer<T>(
  session: StreamSession,
  toolCallId: string,
  parse: (answers: unknown) => T | undefined,
  signal?: AbortSignal,
) {
  return new Promise<T>((resolve, reject) => {
    const finish = (error?: Error, answers?: T) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      session.answers.delete(toolCallId);
      if (error) reject(error);
      else resolve(answers as T);
    };
    const onAbort = () =>
      finish(
        new Error("Question was canceled because the chat stream closed."),
      );
    const timeout = setTimeout(
      () => finish(new Error("Timed out waiting for the user's answer.")),
      QUESTION_TIMEOUT_MS,
    );
    session.answers.set(toolCallId, (raw) => {
      const answers = parse(raw);
      if (answers !== undefined) finish(undefined, answers);
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export function answerQuestion(
  session: StreamSession,
  toolCallId: string,
  answers: unknown,
) {
  session.answers.get(toolCallId)?.(answers);
}

export function isQueuedMessage(
  message: AgentMessage,
): message is QueuedUserMessage {
  return message.role === "user" && "queueId" in message;
}

// Pi has no edit-by-id, so edits and deletes rebuild its steering queue.
export function queueMessage(
  session: StreamSession,
  message: { id: string; content: string },
) {
  const next: QueuedUserMessage = {
    role: "user",
    queueId: message.id,
    content: message.content,
    timestamp: Date.now(),
  };
  const queued = session.agent.peekQueuedMessages();
  const index = queued.findIndex(
    (item) => isQueuedMessage(item) && item.queueId === message.id,
  );
  if (index < 0) return session.agent.steer(next);
  queued[index] = next;
  replaceQueue(session.agent, queued);
}

export function deleteQueuedMessage(session: StreamSession, id: string) {
  replaceQueue(
    session.agent,
    session.agent
      .peekQueuedMessages()
      .filter((message) => !isQueuedMessage(message) || message.queueId !== id),
  );
}

function replaceQueue(agent: Agent, messages: AgentMessage[]) {
  agent.clearSteeringQueue();
  messages.forEach((message) => agent.steer(message));
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
  updateKeepalive();
}

// An idle MV3 service worker stops after about 30 s even with open ports,
// which would lose a run that waits on a question, a sub-agent, or a slow
// provider. Extension API calls reset that timer, so make one while any run
// is in progress.
function updateKeepalive() {
  const running = [...activeStreamSessions.values()].some(
    (session) => !session.cleanupTimeout,
  );
  if (running && !keepalive)
    keepalive = setInterval(() => {
      globalThis.chrome?.runtime?.getPlatformInfo?.().catch(() => undefined);
    }, KEEPALIVE_INTERVAL_MS);
  if (!running && keepalive) {
    clearInterval(keepalive);
    keepalive = undefined;
  }
}

function releaseSession(session: StreamSession) {
  if (session.cleanupTimeout) clearTimeout(session.cleanupTimeout);
  if (activeStreamSessions.get(session.chatId) === session)
    activeStreamSessions.delete(session.chatId);
  session.ports.forEach((port) => portSessions.delete(port));
  session.ports.clear();
  session.answers.clear();
  session.observers.clear();
  session.events.length = 0;
  session.agent.clearAllQueues();
  updateKeepalive();
}

// Only the current session of a chat may publish, so an aborted run's tail
// events never leak into its replacement's replay buffer.
export function postToSession(
  session: StreamSession,
  message: AiStreamResponse,
) {
  if (activeStreamSessions.get(session.chatId) !== session) return;
  const event = { ...message, sequence: session.nextSequence++ };
  session.events.push(event);
  session.ports.forEach((port) => post(port, event));
  session.observers.forEach((observe) => observe(event));
}

export function post(port: chrome.runtime.Port, message: AiStreamResponse) {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post ai-stream message", error);
  }
}

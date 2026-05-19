import type { AiStreamResponse } from "../shared/types";

export type QueuedUserMessage = { id: string; content: string };

export function injectQueuedOpenAIMessages(
  port: chrome.runtime.Port,
  requestMessages: Array<Record<string, unknown>>,
  drainQueuedMessages: () => QueuedUserMessage[],
) {
  const queued = drainQueuedMessages();
  if (!queued.length) return;
  queued.forEach((message) =>
    requestMessages.push({ role: "user", content: message.content }),
  );
  postQueuedMessages(port, queued);
}

export function injectQueuedGeminiMessages(
  port: chrome.runtime.Port,
  contents: Array<Record<string, unknown>>,
  drainQueuedMessages: () => QueuedUserMessage[],
) {
  const queued = drainQueuedMessages();
  if (!queued.length) return;
  contents.push({
    role: "user",
    parts: queued.map((message) => ({ text: message.content })),
  });
  postQueuedMessages(port, queued);
}

function postQueuedMessages(
  port: chrome.runtime.Port,
  queued: QueuedUserMessage[],
) {
  const createdAt = Date.now();
  post(port, {
    type: "queuedMessages",
    messages: queued.map((message, index) => ({
      ...message,
      createdAt: createdAt + index,
    })),
    assistantMessageId: crypto.randomUUID(),
    createdAt: createdAt + queued.length,
  });
}

function post(port: chrome.runtime.Port, message: AiStreamResponse) {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post ai-stream message", error);
  }
}

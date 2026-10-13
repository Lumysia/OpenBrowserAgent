import { loadContent } from "../src/background/sync/service";
import { attachStream } from "../src/background/stream-sessions";
import {
  contentFacts,
  readLocalChatContent,
  saveChatContent,
} from "../src/shared/chat-storage";
import {
  chatContent,
  chatMeta,
  joinChat,
  withChatFacts,
} from "../src/shared/chats";
import { updateAssistantRunMetrics } from "../src/shared/chat-updates";
import { storage } from "../src/shared/storage";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import {
  AI_STREAM_REQUEST_TYPE,
  type AiStreamRequest,
  type ChatContent,
  type ChatMessage,
  type ChatSummary,
  type RunMetrics,
} from "../src/shared/types";
import { attachStreamAction } from "../entrypoints/sidepanel/stream-port";
import type { Device } from "./sync-fixtures";

// The app's own code (storage items, the side panel's stream handling, the
// settings pages' helpers) run against one test device's storage.

export async function onDevice<T>(on: Device, run: () => Promise<T>) {
  const previous = globalThis.chrome;
  const listeners = {
    addListener: () => undefined,
    removeListener: () => undefined,
  };
  globalThis.chrome = {
    storage: { local: on.env.local, onChanged: listeners },
  } as never;
  try {
    const result = await run();
    await on.settle();
    return result;
  } finally {
    globalThis.chrome = previous;
  }
}

export const userMessage = (id: string, createdAt: number): ChatMessage => ({
  id,
  role: "user",
  content: id,
  createdAt,
});

// A reply; without `endedAt` it is still streaming (or its run died).
export const reply = (
  id: string,
  createdAt: number,
  content: string,
  endedAt?: number,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  id,
  role: "assistant",
  content,
  createdAt,
  parts: [],
  metadata: {
    runMetrics: { startedAt: createdAt, ...(endedAt ? { endedAt } : {}) },
  },
  ...extra,
});

// Stores a chat the way the side panel does: its list entry (with the facts
// of its content), then its content.
export async function storeChat(
  on: Device,
  id: string,
  content: ChatContent,
  summary: Partial<ChatSummary> = {},
) {
  const list = (on.get<ChatSummary[]>(STORAGE_KEYS.chats) ?? []).filter(
    (item) => item.id !== id,
  );
  const entry = withChatFacts(
    { id, title: id, kind: "normal", createdAt: 1, updatedAt: 1, ...summary },
    contentFacts(content),
  );
  await on.set(STORAGE_KEYS.chats, [...list, entry]);
  await on.set(`${STORAGE_KEYS.chats}/${id}`, content);
}

export async function openChatContent(on: Device, id: string) {
  await loadContent(on.context, "chats", id);
  await on.settle();
  return on.get<ChatContent | undefined>(`${STORAGE_KEYS.chats}/${id}`);
}

// The side panel showing chat `chatId`, which ends in reply `messageId`
// without an end: it reattaches to that run in the background, which has no
// run of that chat (it died, or ran on another device). Whatever the panel
// stores about the run goes through its usual path (updateChat, then a
// save of the content over what it loaded).
export async function reattachToRun(
  on: Device,
  chatId: string,
  messageId: string,
) {
  return onDevice(on, async () => {
    const writes: Promise<unknown>[] = [];
    const stopped: string[] = [];
    const base = await readLocalChatContent(chatId);
    const summary = (await storage.chats.get()).find(
      (chat) => chat.id === chatId,
    );
    if (!base || !summary) return stopped;
    const updateRunMetrics = (id: string, metrics: Partial<RunMetrics>) => {
      const before = joinChat(summary, base);
      const next = updateAssistantRunMetrics(before, id, metrics);
      writes.push(
        (async () => {
          const saved = await saveChatContent(chatId, chatContent(next), base);
          await storage.chats.update((chats) =>
            chats.map((chat) =>
              chat.id === chatId
                ? withChatFacts(chatMeta(next), saved.facts)
                : chat,
            ),
          );
        })(),
      );
    };
    const background = fakePort();
    const panel = fakePort();
    panel.peer = background;
    background.peer = panel;
    background.listen((request: AiStreamRequest) => {
      if (request.type === AI_STREAM_REQUEST_TYPE.attachStream)
        attachStream(background.port, request.chatId, request.afterSequence);
    });
    (globalThis.chrome as { runtime?: unknown }).runtime = {
      connect: () => panel.port,
    };
    const ignore = () => undefined;
    attachStreamAction({
      chatId,
      targetMessageId: messageId,
      portRefs: { current: {} },
      activeStreamsRef: { current: {} },
      lastStreamActivityRef: { current: {} },
      setActiveStreams: ignore,
      onStreamFinished: ignore,
      onRunStopped: (_chatId: string, id: string) => stopped.push(id),
      appendStreamChunk: ignore,
      appendToAssistant: ignore,
      flushMessageText: ignore,
      appendQueuedMessages: ignore,
      removeQueuedMessage: ignore,
      updateRunMetrics,
    } as Parameters<typeof attachStreamAction>[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.all(writes);
    return stopped;
  });
}

type FakePort = {
  port: chrome.runtime.Port;
  peer?: FakePort;
  listeners: Array<(message: never) => void>;
  listen(listener: (message: never) => void): void;
};

function fakePort(): FakePort {
  const self: FakePort = {
    listeners: [],
    listen: (listener) => void self.listeners.push(listener),
    port: {
      name: "fake",
      postMessage: (message: unknown) =>
        queueMicrotask(() =>
          self.peer?.listeners.forEach((listener) =>
            listener(structuredClone(message) as never),
          ),
        ),
      onMessage: { addListener: (listener: never) => self.listen(listener) },
      onDisconnect: { addListener: () => undefined },
      disconnect: () => undefined,
    } as unknown as chrome.runtime.Port,
  };
  return self;
}

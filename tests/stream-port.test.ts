import assert from "node:assert/strict";
import { test } from "node:test";
import { startStreamAction } from "../entrypoints/sidepanel/stream-port";
import type { ActiveStreamMap } from "../entrypoints/sidepanel/sidepanel-menu-state";
import type {
  AiStreamResponse,
  SendMessagesRequest,
} from "../src/shared/types";

function portFixture() {
  const messages = new Set<(message: AiStreamResponse) => void>();
  const disconnects = new Set<() => void>();
  let disconnected = false;
  return {
    port: {
      postMessage() {},
      disconnect() {
        disconnected = true;
      },
      onMessage: { addListener: (fn) => messages.add(fn) },
      onDisconnect: { addListener: (fn) => disconnects.add(fn) },
    } as chrome.runtime.Port,
    message: (message: AiStreamResponse) =>
      messages.forEach((fn) => fn(message)),
    disconnected: () => disconnected,
    deliverDisconnect: () => disconnects.forEach((fn) => fn()),
  };
}

test("obsolete sidepanel ports cannot finish or disconnect a replacement stream", () => {
  const first = portFixture();
  const second = portFixture();
  const ports = [first.port, second.port];
  Object.assign(globalThis, {
    window: globalThis,
    chrome: { runtime: { connect: () => ports.shift() } },
  });
  const portRefs = {
    current: {} as Record<string, chrome.runtime.Port | undefined>,
  };
  const activeStreamsRef = { current: {} as ActiveStreamMap };
  const chunks: string[] = [];
  const ended: string[] = [];
  const flushed: string[] = [];
  const start = (id: string) => {
    activeStreamsRef.current.chat = {
      chatId: "chat",
      assistantMessageId: id,
      retryCount: 0,
      hasProgress: false,
    };
    startStreamAction({
      request: {
        type: "sendMessages",
        chatId: "chat",
        messageId: id,
      } as SendMessagesRequest,
      targetMessageId: id,
      portRefs,
      activeStreamsRef,
      lastStreamActivityRef: { current: {} },
      setActiveStreams: (update) => {
        activeStreamsRef.current =
          typeof update === "function"
            ? update(activeStreamsRef.current)
            : update;
      },
      onStreamFinished: (chatId) => ended.push(chatId),
      appendStreamChunk: (_chatId, messageId) => chunks.push(messageId),
      appendToAssistant() {},
      flushMessageText: (_chatId, messageId) => flushed.push(messageId),
      updateRunMetrics() {},
      appendQueuedMessages() {},
      removeQueuedMessage() {},
    });
  };
  start("first");
  start("second");
  first.message({ type: "end" });
  first.deliverDisconnect();
  assert.equal(activeStreamsRef.current.chat?.assistantMessageId, "second");
  assert.equal(portRefs.current.chat, second.port);
  assert.equal(second.disconnected(), false);
  assert.deepEqual(ended, []);
  assert.deepEqual(flushed, []);
  second.message({
    type: "chunk",
    chunk: { type: "text-delta", id: "part", delta: "new" },
  });
  assert.deepEqual(chunks, ["second"]);
  second.deliverDisconnect();
  assert.equal(activeStreamsRef.current.chat, undefined);
  assert.deepEqual(flushed, ["second"]);
});

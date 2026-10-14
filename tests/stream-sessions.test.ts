import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import * as sessions from "../src/background/stream-sessions";
import { ABORT_CHAT_STREAMS } from "../src/shared/chat-stream-control";
import type { AiStreamResponse, RunMetrics } from "../src/shared/types";
import { appendQueuedMessages } from "../src/shared/chat-updates";
import { fakePort, swapChrome } from "./fake-chrome";

afterEach(() => mock.restoreAll());

function port() {
  const { port, posted } = fakePort();
  return { events: posted as AiStreamResponse[], port };
}

test("chat close acknowledges cancellation of detached and attached sessions only", () => {
  const detached = sessions.createStreamSession("detached");
  const attached = sessions.createStreamSession("attached");
  const unrelated = sessions.createStreamSession("unrelated");
  const previous = port();
  sessions.attachPortToSession(previous.port, detached, undefined);
  sessions.detachPort(previous.port);
  sessions.attachPortToSession(port().port, attached, undefined);
  const message = {
    type: ABORT_CHAT_STREAMS,
    chatIds: ["detached", "attached", "missing"],
  };
  const acknowledge = (response: unknown) => {
    assert.deepEqual(response, { ok: true });
    for (const session of [detached, attached]) {
      assert.equal(session.abortController.signal.aborted, true);
      assert.equal(sessions.getStreamSession(session.chatId), undefined);
    }
    assert.equal(unrelated.abortController.signal.aborted, false);
  };
  try {
    assert.equal(
      sessions.handleChatStreamControlMessage(message, acknowledge),
      true,
    );
    sessions.handleChatStreamControlMessage(message, acknowledge);
  } finally {
    sessions.abortSession("unrelated");
  }
});

test("reconnect replays only unseen streaming and tool events in order", () => {
  const session = sessions.createStreamSession("replay");
  const client = port();
  sessions.attachPortToSession(client.port, session, undefined);
  sessions.postToSession(session, {
    type: "chunk",
    chunk: { type: "text-start", id: "text" },
  });
  sessions.detachPort(client.port);
  sessions.postToSession(session, {
    type: "chunk",
    chunk: { type: "text-delta", id: "text", delta: "hello" },
  });
  sessions.postToSession(session, {
    type: "chunk",
    chunk: {
      type: "tool-browser_tabs",
      toolCallId: "call",
      toolName: "browser_tabs",
      state: "output-available",
      output: [{ id: 1 }],
    },
  });
  sessions.postToSession(session, { type: "end" });
  const reconnected = port();
  sessions.attachPortToSession(reconnected.port, session, 1);
  assert.deepEqual(
    reconnected.events.map((event) => event.sequence),
    [2, 3, 4],
  );
  assert.deepEqual(reconnected.events[1], session.events[2]);
  sessions.abortSession("replay");
});

test("a running session keeps the service worker alive until its run ends", () => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const getPlatformInfo = mock.fn(async () => ({}));
  const restore = swapChrome({ runtime: { getPlatformInfo } });
  try {
    const session = sessions.createStreamSession("keepalive");
    mock.timers.tick(60_000);
    assert.equal(getPlatformInfo.mock.callCount(), 3);
    sessions.scheduleSessionCleanup(session);
    mock.timers.tick(60_000);
    assert.equal(getPlatformInfo.mock.callCount(), 3);
    sessions.abortSession("keepalive");
  } finally {
    restore();
  }
});

test("a queued turn's assistant message stores its replay position", () => {
  const chat = appendQueuedMessages(
    { id: "c", title: "", messages: [], createdAt: 0, updatedAt: 0 },
    {
      messages: [{ id: "q", content: "next", createdAt: 1 }],
      assistantMessageId: "a2",
      createdAt: 1,
      sequence: 42,
    },
  );
  const metrics = chat.messages.at(-1)?.metadata?.runMetrics as RunMetrics;
  // Without it, reopening the panel replays turn 1 into this message.
  assert.equal(metrics.streamEventIndex, 42);
});

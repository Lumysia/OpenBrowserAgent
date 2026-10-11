import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import * as sessions from "../src/background/stream-sessions";
import { ABORT_CHAT_STREAMS } from "../src/shared/chat-stream-control";
import type { AiStreamResponse } from "../src/shared/types";

afterEach(() => mock.restoreAll());

function port() {
  const events: AiStreamResponse[] = [];
  return {
    events,
    port: {
      postMessage: (event: AiStreamResponse) => events.push(event),
    } as chrome.runtime.Port,
  };
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
  const previous = globalThis.chrome;
  globalThis.chrome = { runtime: { getPlatformInfo } } as never;
  try {
    const session = sessions.createStreamSession("keepalive");
    mock.timers.tick(60_000);
    assert.equal(getPlatformInfo.mock.callCount(), 3);
    sessions.scheduleSessionCleanup(session);
    mock.timers.tick(60_000);
    assert.equal(getPlatformInfo.mock.callCount(), 3);
    sessions.abortSession("keepalive");
  } finally {
    globalThis.chrome = previous;
  }
});

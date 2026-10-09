import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import * as sessions from "../src/background/stream-sessions";
import type {
  AiStreamResponse,
  SendMessagesRequest,
} from "../src/shared/types";

afterEach(() => mock.restoreAll());

function request(chatId: string) {
  return { chatId, messageId: "answer" } as SendMessagesRequest;
}

function port() {
  const events: AiStreamResponse[] = [];
  return {
    events,
    port: {
      postMessage: (event: AiStreamResponse) => events.push(event),
    } as chrome.runtime.Port,
  };
}

test("reattaching a completed stream does not cancel its retention deadline", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const session = sessions.createStreamSession(request("retention"));
  sessions.postToSession(session, { type: "end" });
  sessions.scheduleSessionCleanup(session);
  const client = port();
  sessions.attachPortToSession(client.port, session, 0);
  assert.deepEqual(client.events, [{ type: "end", sequence: 1 }]);
  mock.timers.tick(5 * 60_000);
  assert.equal(sessions.getStreamSession("retention"), undefined);
  assert.equal(sessions.firstPortSession(client.port), undefined);
});

test("an obsolete port cannot abort the replacement run of the same chat", () => {
  const previous = sessions.createStreamSession(request("replacement"));
  const client = port();
  sessions.attachPortToSession(client.port, previous, undefined);
  sessions.abortSession("replacement");
  const next = sessions.createStreamSession(request("replacement"));
  sessions.abortPortStreams(client.port);
  assert.equal(next.abortController.signal.aborted, false);
  assert.equal(sessions.getStreamSession("replacement"), next);
  sessions.abortSession("replacement");
});

test("reconnect replays only unseen streaming and tool events in order", () => {
  const session = sessions.createStreamSession(request("replay"));
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

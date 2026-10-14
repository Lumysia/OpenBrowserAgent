import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
import { knownOutputLimit } from "../src/background/model-catalog";
import { runPiAgent } from "../src/background/pi-runtime";
import * as sessions from "../src/background/stream-sessions";
import { modelStopNote, RUN_STOP_REASON } from "../src/shared/run-stop";
import type { AiStreamResponse, ChatMessage } from "../src/shared/types";
import {
  chatDelta,
  installPiRuntimeBrowser,
  setupPiRuntime,
} from "./pi-runtime-helpers";
import { providerFixture, reply } from "./provider-fixtures";

installPiRuntimeBrowser();

const ROWS = Array.from({ length: 8 }, (_, i) => `| row ${i} | cell ${i} |\n`);
const CUT = "| 稠";

function listen(run: ReturnType<typeof setupPiRuntime>) {
  const seen: AiStreamResponse[] = [];
  sessions.attachPortToSession(
    {
      postMessage: (event: AiStreamResponse) => void seen.push(event),
    } as unknown as chrome.runtime.Port,
    run.session,
    0,
  );
  return seen;
}

function streamedText(events: AiStreamResponse[]) {
  return events
    .flatMap((event) => (event.type === "chunk" ? [event.chunk] : []))
    .map((chunk) => chunk as { type: string; delta?: string })
    .filter((chunk) => chunk.type === "text-delta")
    .map((chunk) => chunk.delta)
    .join("");
}

function metrics(events: AiStreamResponse[]) {
  return events.flatMap((event) =>
    event.type === "metrics" ? [event.metrics] : [],
  );
}

function startStream(response: ServerResponse) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
}

test("a reply cut at the output limit ends as a length stop, not as an error", async () => {
  const fixture = await providerFixture((_request, response) => {
    startStream(response);
    for (const row of ROWS) chatDelta(response, { content: row });
    chatDelta(response, { content: CUT }, "length");
    response.end("data: [DONE]\n\n");
  });
  const run = setupPiRuntime(fixture.baseUrl);
  const seen = listen(run);
  try {
    await runPiAgent(run.options);
    assert.ok(streamedText(seen).endsWith(CUT));
    assert.ok(!seen.some((event) => event.type === "error"));
    assert.equal(metrics(seen).at(-1)?.stopReason, RUN_STOP_REASON.length);
    // The fixture model is not in Pi's catalog: no output limit is sent.
    const body = fixture.requests[0].body;
    assert.equal(body.max_tokens ?? body.max_completion_tokens, undefined);
  } finally {
    run.close();
    await fixture.close();
  }
});

test("a model Pi's catalog knows gets its output limit in the request", async () => {
  const modelName = Object.keys(OPENAI_MODELS)[0];
  const limit = knownOutputLimit("openai", modelName);
  assert.ok(limit);
  const fixture = await providerFixture((request, response) =>
    reply(response, request.protocol, { text: "ok" }),
  );
  const run = setupPiRuntime(fixture.baseUrl);
  run.options.model = { ...run.options.model, modelName };
  try {
    await runPiAgent(run.options);
    const body = fixture.requests[0].body;
    assert.equal(body.max_tokens ?? body.max_completion_tokens, limit);
  } finally {
    run.close();
    await fixture.close();
  }
});

test("a stream that breaks mid-answer ends as an error and keeps the text", async () => {
  const fixture = await providerFixture((_request, response) => {
    startStream(response);
    for (const row of ROWS) chatDelta(response, { content: row });
    chatDelta(response, { content: CUT });
    response.end();
  });
  const run = setupPiRuntime(fixture.baseUrl);
  const seen = listen(run);
  try {
    await assert.rejects(runPiAgent(run.options));
    assert.ok(streamedText(seen).endsWith(CUT));
    assert.equal(metrics(seen).at(-1)?.stopReason, RUN_STOP_REASON.error);
    assert.equal(metrics(seen).at(-1)?.modelCalls, 1);
  } finally {
    run.close();
    await fixture.close();
  }
});

test("a stopped run still reports how it ended and its last request's usage", async () => {
  const fixture = await providerFixture(async (_request, response) => {
    startStream(response);
    response.write(
      `data: ${JSON.stringify({
        choices: [{ index: 0, delta: { content: ROWS[0] } }],
        usage: { prompt_tokens: 50, completion_tokens: 3, total_tokens: 53 },
      })}\n\n`,
    );
    for (const row of ROWS.slice(1)) {
      chatDelta(response, { content: row });
      await delay(20);
    }
  });
  const run = setupPiRuntime(fixture.baseUrl);
  const seen = listen(run);
  const running = runPiAgent(run.options).then(
    () => "resolved",
    (error: Error) => error.name,
  );
  try {
    while (!streamedText(seen)) await delay(5);
    const before = seen.length;
    sessions.abortSession(run.session.chatId);
    assert.equal(sessions.isChatRunning(run.session.chatId), false);
    assert.equal(await running, "AbortError");
    const after = metrics(seen.slice(before));
    assert.equal(after.at(-1)?.stopReason, RUN_STOP_REASON.aborted);
    assert.equal(after.at(-1)?.usage?.inputTokens, 50);
    assert.equal(after.at(-1)?.modelCalls, 1);
    // Settled: the session is released and publishes nothing more.
    sessions.scheduleSessionCleanup(run.session);
    const count = seen.length;
    sessions.postToSession(run.session, { type: "end" });
    assert.equal(seen.length, count);
  } finally {
    await fixture.close();
  }
});

test("a queued message after a length stop gets its answer, and the model learns the reply was cut", async () => {
  let run: ReturnType<typeof setupPiRuntime>;
  const fixture = await providerFixture(async (request, response, requests) => {
    if (requests.length > 1)
      return reply(response, request.protocol, { text: "Follow-up" });
    startStream(response);
    for (const [index, row] of ROWS.entries()) {
      chatDelta(response, { content: row });
      if (index === 2)
        sessions.queueMessage(run.session, { id: "q1", content: "queued" });
      await delay(5);
    }
    chatDelta(response, { content: CUT }, "length");
    response.end("data: [DONE]\n\n");
  });
  run = setupPiRuntime(fixture.baseUrl);
  const seen = listen(run);
  try {
    await runPiAgent(run.options);
    const ack = seen.findIndex((event) => event.type === "queuedMessages");
    assert.ok(ack > 0);
    assert.ok(streamedText(seen.slice(0, ack)).endsWith(CUT));
    assert.equal(
      metrics(seen.slice(0, ack)).at(-1)?.stopReason,
      RUN_STOP_REASON.length,
    );
    assert.equal(streamedText(seen.slice(ack)), "Follow-up");
    assert.equal(
      metrics(seen.slice(ack)).at(-1)?.stopReason,
      RUN_STOP_REASON.finished,
    );
    const replayed = fixture.requests[1].body.messages.filter(
      (message: { role: string }) => message.role === "assistant",
    );
    assert.match(
      JSON.stringify(replayed.at(-1)?.content),
      new RegExp(escape(modelStopNote("length"))),
    );
  } finally {
    run.close();
    await fixture.close();
  }
});

test("modelCalls counts the requests sent, not the replayed history", async () => {
  const fixture = await providerFixture((request, response) =>
    reply(response, request.protocol, { text: "answer" }),
  );
  const run = setupPiRuntime(fixture.baseUrl);
  const call = (id: string, step: string) => ({
    id,
    type: "tool-tabs" as const,
    toolName: "tabs",
    state: "output-available" as const,
    input: { action: "list" },
    result: { text: "r" },
    step,
  });
  run.options.messages = [
    { id: "u1", role: "user", content: "q1", createdAt: 1 },
    {
      id: "a1",
      role: "assistant",
      content: "old answer",
      createdAt: 2,
      parts: [
        call("c1", "s1"),
        call("c2", "s2"),
        { id: "t1", type: "text", text: "old answer" },
      ],
    },
    { id: "u2", role: "user", content: "q2", createdAt: 3 },
  ] satisfies ChatMessage[];
  const seen = listen(run);
  try {
    await runPiAgent(run.options);
    assert.equal(fixture.requests.length, 1);
    assert.equal(metrics(seen).at(-1)?.modelCalls, 1);
  } finally {
    run.close();
    await fixture.close();
  }
});

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

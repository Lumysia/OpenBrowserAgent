import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { runPiAgent } from "../src/background/pi-runtime";
import { streamPartFromChunk } from "../src/shared/chat-stream-parts";
import { storage } from "../src/shared/storage";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import type { AiStreamResponse } from "../src/shared/types";
import * as sessions from "../src/background/stream-sessions";
import { installPiRuntimeBrowser, setupPiRuntime } from "./pi-runtime-helpers";
import { providerFixture, reply, toolResults } from "./provider-fixtures.mjs";

installPiRuntimeBrowser();

function setup(baseUrl: string, maxToolSteps = 2) {
  const run = setupPiRuntime(baseUrl);
  run.options.maxToolSteps = maxToolSteps;
  return run;
}

test("Pi executes real extension tools, bounds tool turns, and keeps usage", async () => {
  const fixture = await providerFixture((request, response, requests) =>
    reply(
      response,
      request.protocol,
      requests.length <= 3
        ? {
            thinking: "Inspecting.",
            calls: [
              {
                id: `call_${requests.length}`,
                name: "tabs",
                args: { action: "list" },
              },
            ],
          }
        : { text: "Done" },
    ),
  );
  const run = setup(fixture.baseUrl);
  try {
    await runPiAgent(run.options);
    assert.equal(fixture.requests.length, 4);
    // Tools stay declared, byte for byte, so the cached prefix holds; the
    // call past the step limit is refused in its result instead.
    assert.ok(fixture.requests[0].body.tools.length);
    for (const request of fixture.requests)
      assert.deepEqual(request.body.tools, fixture.requests[0].body.tools);
    assert.match(
      JSON.stringify(toolResults(fixture.requests[3])),
      /tool step limit for this run is reached/,
    );
    assert.match(
      JSON.stringify(toolResults(fixture.requests[1])),
      /Fixture tab/,
    );
    const metrics = run.session.events.flatMap((event) =>
      event.type === "metrics" ? [event.metrics] : [],
    );
    assert.equal(metrics.at(-1)?.modelCalls, 4);
    assert.equal(metrics.at(-1)?.usage?.totalTokens, 60);
    const parts = run.session.events.flatMap((event) =>
      event.type === "chunk" ? [streamPartFromChunk(event.chunk).part] : [],
    );
    assert.ok(
      parts.some(
        (part) => part?.type === "reasoning" && part.text === "Inspecting.",
      ),
    );
    // Each call is announced once without argument snapshots, then executed.
    const states = (id: string) =>
      run.session.events.flatMap((event) =>
        event.type === "chunk" && event.chunk.toolCallId === id
          ? [[event.chunk.state, event.chunk.input]]
          : [],
      );
    assert.deepEqual(states("call_1").slice(0, 2), [
      ["input-streaming", undefined],
      ["input-available", { action: "list" }],
    ]);
    assert.equal(states("call_1")[2][0], "output-available");
    assert.equal(run.session.agent.state.isStreaming, false);
    assert.equal(run.session.agent.state.pendingToolCalls.size, 0);
  } finally {
    run.close();
    await fixture.close();
  }
});

test("toolSearch appends on-demand tools for Pi's next turn", async () => {
  mock.method(storage.mcpServers, "get", async () => []);
  const fixture = await providerFixture((request, response, requests) =>
    reply(
      response,
      request.protocol,
      requests.length === 1
        ? {
            calls: [
              {
                id: "load",
                name: "toolSearch",
                args: { names: ["mcpServers"] },
              },
            ],
          }
        : requests.length === 2
          ? {
              calls: [
                {
                  id: "list",
                  name: "mcpServers",
                  args: { action: "list" },
                },
              ],
            }
          : { text: "Done" },
    ),
  );
  const run = setup(fixture.baseUrl, 3);
  try {
    await runPiAgent(run.options);
    assert.equal(
      fixture.requests[0].body.tools.some(
        (tool) => tool.function.name === "mcpServers",
      ),
      false,
    );
    assert.equal(
      fixture.requests[1].body.tools.some(
        (tool) => tool.function.name === "mcpServers",
      ),
      true,
    );
    assert.match(JSON.stringify(toolResults(fixture.requests[2])), /servers/);
    assert.equal(
      run.session.agent.state.tools.some((tool) => tool.name === "mcpServers"),
      true,
    );
  } finally {
    run.close();
    await fixture.close();
  }
});

test("cancellation aborts an in-flight HTTP stream and Pi returns to idle", async () => {
  const closed = Promise.withResolvers<void>();
  const fixture = await providerFixture((request, response) => {
    response.on("close", closed.resolve);
    reply(response, request.protocol, { text: "Starting", end: false });
  });
  const run = setup(fixture.baseUrl);
  run.session.agent.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    )
      run.session.abortController.abort();
  });
  try {
    await assert.rejects(runPiAgent(run.options), { name: "AbortError" });
    await closed.promise;
    assert.equal(run.session.agent.state.isStreaming, false);
    assert.equal(fixture.requests.length, 1);
  } finally {
    run.close();
    await fixture.close();
  }
});

test("question wait survives a panel reconnect, accepts an answer and can be aborted", async () => {
  const fixture = await providerFixture((request, response, requests) =>
    reply(
      response,
      request.protocol,
      requests.length % 2 === 1
        ? {
            calls: [
              {
                id: "ask",
                name: "ask",
                args: {
                  questions: [{ question: "Pick", options: [{ label: "A" }] }],
                },
              },
            ],
          }
        : { text: "Answered" },
    ),
  );
  const run = setup(fixture.baseUrl);
  let answerScheduled = false;
  const seen: AiStreamResponse[] = [];
  const client = {
    postMessage(event: AiStreamResponse) {
      seen.push(event);
      if (
        event.type === "chunk" &&
        event.chunk.state === "input-available" &&
        !answerScheduled
      ) {
        answerScheduled = true;
        setTimeout(() => {
          sessions.detachPort(client);
          assert.equal(run.session.agent.state.isStreaming, true);
          sessions.attachPortToSession(client, run.session, event.sequence);
          // An empty answer keeps waiting; the real one resolves the call.
          sessions.answerQuestion(run.session, "ask", []);
          sessions.answerQuestion(run.session, "ask", [
            { question: "Pick", answers: ["A"] },
          ]);
        }, 0);
      }
    },
  } as chrome.runtime.Port;
  sessions.attachPortToSession(client, run.session, 0);
  try {
    await runPiAgent(run.options);
    assert.match(JSON.stringify(toolResults(fixture.requests[1])), /Pick/);
    assert.equal(
      new Set(seen.map((event) => event.sequence)).size,
      seen.length,
    );
    const second = setup(fixture.baseUrl);
    second.session.agent.subscribe((event) => {
      if (event.type === "tool_execution_start")
        setTimeout(() => second.session.abortController.abort(), 0);
    });
    try {
      await assert.rejects(runPiAgent(second.options), { name: "AbortError" });
      assert.equal(second.session.answers.size, 0);
      assert.equal(second.session.agent.state.isStreaming, false);
    } finally {
      second.close();
    }
  } finally {
    run.close();
    await fixture.close();
  }
});

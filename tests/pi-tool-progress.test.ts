import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerResponse } from "node:http";
import { runPiAgent } from "../src/background/pi-runtime";
import { providerFixture, reply, toolResults } from "./provider-fixtures.mjs";
import {
  chatDelta,
  installPiRuntimeBrowser,
  setupPiRuntime,
  toolDelta,
} from "./pi-runtime-helpers";

installPiRuntimeBrowser();

test(
  "tool-only partial arguments reach the UI before execution and retain one call ID through output",
  { timeout: 10000 },
  async () => {
    const firstDelta = Promise.withResolvers<void>();
    const completeArgs = Promise.withResolvers<void>();
    let response: ServerResponse;
    const removed: unknown[] = [];
    Object.assign(chrome.tabs, {
      remove: async (ids: unknown) => {
        removed.push(ids);
      },
    });
    const fixture = await providerFixture((request, res, requests) => {
      if (requests.length > 1)
        return reply(res, request.protocol, { text: "Done" });
      response = res;
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      toolDelta(res, '{"operation":"close","tabIds":[42', true);
    });
    const run = setupPiRuntime(fixture.baseUrl);
    let deltas = 0;
    run.session.agent.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "toolcall_delta"
      ) {
        if (++deltas === 1) firstDelta.resolve();
        else completeArgs.resolve();
      }
    });
    const running = runPiAgent(run.options);
    const chunks = () =>
      run.session.events.flatMap((event) =>
        event.type === "chunk" ? [event.chunk] : [],
      );
    try {
      await firstDelta.promise;
      const streaming = chunks();
      assert.ok(
        streaming.length > 0,
        "tool-only generation must set sidepanel progress while HTTP remains open",
      );
      assert.ok(
        streaming.every(
          (chunk) =>
            chunk.toolCallId === "close" &&
            chunk.toolName === "manageTabs" &&
            chunk.state === "input-streaming",
        ),
      );
      assert.deepEqual(removed, []);
      assert.equal(run.session.agent.state.isStreaming, true);
      toolDelta(response!, "]}");
      await completeArgs.promise;
      assert.ok(
        chunks().length > streaming.length,
        "native argument deltas must continue updating progress",
      );
      assert.deepEqual(chunks().at(-1)?.input, {
        operation: "close",
        tabIds: [42],
      });
      assert.deepEqual(
        removed,
        [],
        "complete JSON still cannot execute until the provider finishes",
      );
      chatDelta(response!, {}, "tool_calls");
      response!.end("data: [DONE]\n\n");
      await running;
      assert.deepEqual(removed, [[42]]);
      assert.equal(toolResults(fixture.requests[1]).length, 1);
      const toolChunks = chunks().filter((chunk) => chunk.toolCallId);
      assert.ok(toolChunks.every((chunk) => chunk.toolCallId === "close"));
      const available = toolChunks.findIndex(
        (chunk) => chunk.state === "input-available",
      );
      assert.ok(available > 0);
      assert.ok(
        toolChunks
          .slice(0, available)
          .every((chunk) => chunk.state === "input-streaming"),
      );
      assert.deepEqual(
        toolChunks.slice(available).map((chunk) => chunk.state),
        ["input-available", "output-available"],
      );
    } finally {
      run.close();
      await running.catch(() => {});
      await fixture.close();
    }
  },
);

for (const provider of [
  "openai",
  "openai-responses",
  "anthropic",
  "gemini",
  "ollama",
] as const) {
  test(`${provider}: native tool lifecycle publishes progress before extension execution`, async () => {
    const fixture = await providerFixture((request, response) =>
      reply(
        response,
        request.protocol,
        toolResults(request).length
          ? { text: "Done" }
          : {
              calls: [
                { id: "tabs", name: "manageTabs", args: { operation: "list" } },
              ],
            },
      ),
    );
    const run = setupPiRuntime(fixture.baseUrl, provider);
    let progressAtExecution = false;
    let callId: string | undefined;
    run.session.agent.subscribe((event) => {
      if (event.type !== "tool_execution_start") return;
      callId = event.toolCallId;
      progressAtExecution = run.session.events.some(
        (item) =>
          item.type === "chunk" &&
          item.chunk.toolCallId === callId &&
          item.chunk.state === "input-streaming",
      );
    });
    try {
      await runPiAgent(run.options);
      assert.equal(progressAtExecution, true);
      assert.ok(callId);
      const chunks = run.session.events.flatMap((event) =>
        event.type === "chunk" && event.chunk.toolCallId ? [event.chunk] : [],
      );
      assert.ok(chunks.every((chunk) => chunk.toolCallId === callId));
      assert.equal(chunks.at(-1)?.state, "output-available");
    } finally {
      run.close();
      await fixture.close();
    }
  });
}

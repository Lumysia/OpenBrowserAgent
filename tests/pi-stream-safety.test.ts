import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { runPiAgent } from "../src/background/pi-runtime";
import { providerFixture, reply, toolResults } from "./provider-fixtures.mjs";
import {
  chatDelta,
  installPiRuntimeBrowser,
  setupPiRuntime,
  toolDelta,
} from "./pi-runtime-helpers";

installPiRuntimeBrowser();

for (const provider of ["openai", "ollama"] as const) {
  for (const ending of ["eof", "done", "length", "complete"] as const) {
    test(`${provider}: ${ending} only executes a complete, successfully terminated tool call`, async () => {
      const removed: unknown[] = [];
      Object.assign(chrome.tabs, {
        remove: async (ids: unknown) => {
          removed.push(ids);
        },
      });
      const query = mock.method(chrome.tabs, "query", async () => []);
      const fixture = await providerFixture((request, response, requests) => {
        if (requests.length > 1)
          return reply(response, request.protocol, { text: "Done" });
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        toolDelta(response, '{"operation":"close","tabIds":[42', true);
        if (ending === "complete") toolDelta(response, "]}");
        if (ending === "length" || ending === "complete")
          chatDelta(
            response,
            {},
            ending === "length" ? "length" : "tool_calls",
          );
        response.end(ending === "eof" ? "" : "data: [DONE]\n\n");
      });
      const run = setupPiRuntime(fixture.baseUrl, provider);
      let executions = 0;
      run.session.agent.subscribe((event) => {
        if (event.type === "tool_execution_start") executions++;
      });
      try {
        if (ending === "eof" || ending === "done") {
          await assert.rejects(
            runPiAgent(run.options),
            /without finish_reason/,
          );
          assert.equal(fixture.requests.length, 1);
          assert.equal(executions, 0);
        } else {
          await runPiAgent(run.options);
          assert.equal(fixture.requests.length, 2);
          assert.equal(toolResults(fixture.requests[1]).length, 1);
        }
        assert.deepEqual(removed, ending === "complete" ? [[42]] : []);
        assert.equal(query.mock.callCount(), 0);
        assert.equal(
          run.session.events.filter(
            (event) =>
              event.type === "chunk" && event.chunk.state === "input-available",
          ).length,
          ending === "complete" ? 1 : 0,
        );
        assert.equal(run.session.agent.state.isStreaming, false);
        assert.equal(run.session.agent.state.pendingToolCalls.size, 0);
      } finally {
        run.close();
        await fixture.close();
      }
    });
  }
}

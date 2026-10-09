import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { runPiAgent } from "../src/background/pi-runtime";
import { storage } from "../src/shared/storage";
import { providerFixture, reply, toolResults } from "./provider-fixtures.mjs";
import { installPiRuntimeBrowser, setupPiRuntime } from "./pi-runtime-helpers";

installPiRuntimeBrowser();

for (const mode of ["error", "abort"] as const) {
  test(
    `Pi MCP ${mode}: preserves tool failure or aborts an open HTTP response`,
    { timeout: 5000 },
    async () => {
      const started = Promise.withResolvers<void>();
      const closed = Promise.withResolvers<void>();
      const fixture = await providerFixture((request, response) => {
        if (request.url === "/mcp") {
          if (request.body.method === "notifications/initialized") {
            response.writeHead(202).end();
            return;
          }
          if (request.body.method === "tools/call") {
            response.on("close", closed.resolve);
            response.writeHead(200, { "Content-Type": "text/event-stream" });
            response.write(
              'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\n',
            );
            started.resolve();
            if (mode === "error")
              response.write(
                `data: ${JSON.stringify({ jsonrpc: "2.0", id: request.body.id, result: { isError: true, content: [{ type: "text", text: "Tool failed safely" }] } })}\n\n`,
              );
            return;
          }
          response.writeHead(200, { "Content-Type": "application/json" }).end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.body.id,
              result: { protocolVersion: "2025-06-18" },
            }),
          );
          return;
        }
        reply(
          response,
          request.protocol,
          toolResults(request).length
            ? { text: "Recovered" }
            : {
                calls: [
                  { id: "mcp-call", name: "mcp__Fixture__echo", args: {} },
                ],
              },
        );
      });
      const run = setupPiRuntime(fixture.baseUrl);
      run.options.capabilities.mcpTools = true;
      run.options.mcpServers = [
        {
          id: "fixture",
          name: "Fixture",
          url: `${fixture.baseUrl}/mcp`,
          enabled: true,
          testedAt: 1,
          createdAt: 1,
          updatedAt: 1,
          tools: [
            {
              name: "echo",
              enabled: true,
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      ];
      mock.method(
        storage.mcpServers,
        "get",
        async () => run.options.mcpServers,
      );
      const running = runPiAgent(run.options);
      try {
        if (mode === "abort") {
          const rejected = assert.rejects(running, { name: "AbortError" });
          await started.promise;
          run.session.abortController.abort();
          await rejected;
        } else {
          await running;
          assert.ok(
            run.session.events.some(
              (event) =>
                event.type === "chunk" &&
                event.chunk.toolCallId === "mcp-call" &&
                event.chunk.state === "output-error",
            ),
          );
          assert.match(
            JSON.stringify(toolResults(fixture.requests.at(-1)!)),
            /Tool failed safely/,
          );
        }
        await closed.promise;
        assert.equal(run.session.agent.state.isStreaming, false);
      } finally {
        run.close();
        await fixture.close();
        await running.catch(() => undefined);
      }
    },
  );
}

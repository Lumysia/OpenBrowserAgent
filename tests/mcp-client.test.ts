import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
  callMcpServerTool,
  listMcpServerTools,
} from "../src/shared/mcp-client";
import type { McpServerConfig } from "../src/shared/mcp";

const server = {
  id: "fixture",
  name: "Fixture",
  url: "https://mcp.example.test/",
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
} satisfies McpServerConfig;
afterEach(() => mock.restoreAll());

function mockServer(
  respond: (request: Record<string, any>, init: RequestInit) => Response,
) {
  return mock.method(globalThis, "fetch", async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    if (request.method === "initialize")
      return Response.json(
        {
          jsonrpc: "2.0",
          id: request.id,
          result: { protocolVersion: "2025-06-18" },
        },
        { headers: { "Mcp-Session-Id": "fixture-session" } },
      );
    if (request.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    assert.equal(
      new Headers(init?.headers).get("Mcp-Session-Id"),
      "fixture-session",
    );
    return respond(request, init!);
  });
}

test("MCP SSE correlates responses after notifications and joins multiline data", async () => {
  mockServer(
    (request) =>
      new Response(
        [
          'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}',
          "",
          'data: {"jsonrpc":"2.0","id":"unrelated","result":{}}',
          "",
          `data: {"jsonrpc":"2.0","id":"${request.id}",`,
          'data: "result":{"content":[{"type":"text","text":"café"}]}}',
          "",
          "",
        ].join("\r\n"),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
  );
  assert.deepEqual(await callMcpServerTool(server, "echo", {}), {
    content: [{ type: "text", text: "café" }],
  });
});

test(
  "MCP resolves a complete SSE response without waiting for connection close",
  { timeout: 2000 },
  async () => {
    let canceled = false;
    let closed = false;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    mockServer(
      (request) =>
        new Response(
          new ReadableStream({
            start(next) {
              controller = next;
              const bytes = new TextEncoder().encode(
                `data: ${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: "标签" }] } })}\n\n`,
              );
              for (const byte of bytes) next.enqueue(Uint8Array.of(byte));
            },
            cancel() {
              canceled = true;
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    );
    const timeout = setTimeout(() => {
      closed = true;
      controller.close();
    }, 300);
    try {
      assert.deepEqual(await callMcpServerTool(server, "echo", {}), {
        content: [{ type: "text", text: "标签" }],
      });
      assert.equal(
        canceled,
        true,
        "response must complete while the connection is still open",
      );
    } finally {
      clearTimeout(timeout);
      if (!canceled && !closed) controller!.close();
    }
  },
);

test("MCP discovery follows pagination and keeps every tool schema", async () => {
  mockServer((request) =>
    Response.json({
      jsonrpc: "2.0",
      id: request.id,
      result: request.params.cursor
        ? {
            tools: [
              {
                name: "second",
                inputSchema: { type: "object", additionalProperties: false },
              },
            ],
          }
        : { tools: [{ name: "first" }], nextCursor: "page-2" },
    }),
  );
  const tools = await listMcpServerTools(server);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["first", "second"],
  );
  assert.deepEqual(tools[1].inputSchema, {
    type: "object",
    additionalProperties: false,
  });
});

test("MCP rejects mismatched JSON-RPC responses and repeated pagination cursors", async () => {
  mockServer(() => Response.json({ jsonrpc: "2.0", id: "wrong", result: {} }));
  await assert.rejects(callMcpServerTool(server, "echo", {}), /response/i);
  mock.restoreAll();
  mockServer((request) =>
    Response.json({
      jsonrpc: "2.0",
      id: request.id,
      result: { tools: [{ name: "first" }], nextCursor: "same" },
    }),
  );
  await assert.rejects(listMcpServerTools(server), /cursor/i);
});

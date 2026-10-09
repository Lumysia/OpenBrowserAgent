import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { runPiAgent } from "../src/background/pi-runtime";
import { storage } from "../src/shared/storage";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import type {
  AgentCapabilities,
  AiStreamResponse,
  SendMessagesRequest,
  McpServerConfig,
} from "../src/shared/types";
import * as sessions from "../src/background/stream-sessions";
import { installBrowser } from "./helpers";
import { providerFixture, reply, toolResults } from "./provider-fixtures.mjs";

beforeEach(() => {
  installBrowser();
  Object.assign(chrome.storage, {
    onChanged: { addListener() {}, removeListener() {} },
  });
  Object.assign(chrome, {
    tabs: {
      query: async () => [
        {
          id: 42,
          title: "Fixture tab",
          url: "https://example.test/",
          active: true,
        },
      ],
    },
  });
  mock.method(storage.preferences, "get", async () => DEFAULT_PREFERENCES);
});
afterEach(() => mock.restoreAll());

function setup(
  baseUrl: string,
  maxToolSteps = 2,
  capabilities: Partial<AgentCapabilities> = {},
) {
  const chatId = crypto.randomUUID();
  const session = sessions.createStreamSession({
    chatId,
    messageId: "answer",
  } as SendMessagesRequest);
  const options = {
    agent: session.agent,
    model: {
      provider: "openai" as const,
      baseUrl: `${baseUrl}/v1`,
      modelName: "fixture",
      apiKey: "",
    },
    system: "Assist with browsing",
    messages: [
      { id: "user", role: "user" as const, content: "Help", createdAt: 1 },
    ],
    capabilities: {
      browserTools: true,
      browserAutomation: true,
      ...capabilities,
    } as AgentCapabilities,
    maxToolSteps,
    signal: session.abortController.signal,
    port: sessions.streamSessionPort(session),
    chatId,
    messageId: "answer",
    uploadedAttachments: [],
    availableSkills: [],
    mcpServers: [] as McpServerConfig[],
  };
  return { session, options, close: () => sessions.abortSession(chatId) };
}

test("Pi executes real extension tools, bounds tool turns, and keeps usage", async () => {
  const fixture = await providerFixture((request, response, requests) =>
    reply(
      response,
      request.protocol,
      requests.length <= 2
        ? {
            calls: [
              {
                id: `call_${requests.length}`,
                name: "manageTabs",
                args: { operation: "list" },
              },
            ],
          }
        : { text: "Done" },
    ),
  );
  const run = setup(fixture.baseUrl);
  try {
    const result = await runPiAgent(run.options);
    assert.equal(fixture.requests.length, 3);
    assert.ok(fixture.requests[0].body.tools.length);
    assert.equal(fixture.requests[2].body.tools?.length || 0, 0);
    assert.match(
      JSON.stringify(fixture.requests[2].body),
      /Maximum browser tool steps reached/,
    );
    assert.match(
      JSON.stringify(toolResults(fixture.requests[1])),
      /Fixture tab/,
    );
    assert.equal(result.usage?.totalTokens, 45);
    assert.equal(run.session.agent.state.isStreaming, false);
    assert.equal(run.session.agent.state.pendingToolCalls.size, 0);
  } finally {
    run.close();
    await fixture.close();
  }
});

test("MCP tools retain their JSON schemas and execute the extension's HTTP MCP client", async () => {
  const fixture = await providerFixture((request, response) => {
    if (request.url === "/mcp") {
      if (request.body.method === "notifications/initialized") {
        response.writeHead(202).end();
        return;
      }
      const result =
        request.body.method === "initialize"
          ? {
              protocolVersion: "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "fixture", version: "1" },
            }
          : {
              content: [
                {
                  type: "text",
                  text: `Echo ${request.body.params.arguments.value}`,
                },
              ],
            };
      response
        .writeHead(200, {
          "Content-Type": "application/json",
          "Mcp-Session-Id": "fixture-session",
        })
        .end(JSON.stringify({ jsonrpc: "2.0", id: request.body.id, result }));
      return;
    }
    reply(
      response,
      request.protocol,
      toolResults(request).length
        ? { text: "MCP done" }
        : {
            calls: [
              {
                id: "mcp",
                name: "mcp__Fixture__echo",
                args: { value: "hello" },
              },
            ],
          },
    );
  });
  const run = setup(fixture.baseUrl, 2, { mcpTools: true });
  const servers: McpServerConfig[] = [
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
          inputSchema: {
            type: "object",
            properties: { value: { type: "string" } },
            required: ["value"],
          },
        },
      ],
    },
  ];
  run.options.mcpServers = servers;
  mock.method(storage.mcpServers, "get", async () => servers);
  try {
    await runPiAgent(run.options);
    assert.equal(
      fixture.requests.filter((request) => request.body.method === "tools/call")
        .length,
      1,
    );
    assert.match(
      JSON.stringify(toolResults(fixture.requests.at(-1)!)),
      /Echo hello/,
    );
    assert.equal(
      fixture.requests.find((request) => request.body.method === "tools/call")
        ?.headers["mcp-session-id"],
      "fixture-session",
    );
  } finally {
    run.close();
    await fixture.close();
  }
});

test("context pruning requests one anchored summary and reports it without streaming summary text to the user", async () => {
  mock.method(storage.preferences, "get", async () => ({
    ...DEFAULT_PREFERENCES,
    contextRequestMaxChars: 16000,
    contextTailMinMessages: 2,
  }));
  const fixture = await providerFixture((request, response, requests) =>
    reply(response, request.protocol, {
      text: requests.length === 1 ? "Anchored summary" : "Final answer",
    }),
  );
  const run = setup(fixture.baseUrl, 0);
  run.options.messages = Array.from({ length: 15 }, (_, index) => ({
    id: String(index),
    role: "user",
    createdAt: index,
    content: "old ".repeat(5000),
  }));
  run.options.messages.push({
    id: "latest",
    role: "user",
    createdAt: 20,
    content: "Latest request",
  });
  try {
    await runPiAgent(run.options);
    assert.equal(fixture.requests.length, 2);
    assert.match(JSON.stringify(fixture.requests[1].body), /Anchored summary/);
    const text = run.session.events
      .flatMap((event) =>
        event.type === "chunk" && event.chunk.type === "text-delta"
          ? [event.chunk.delta]
          : [],
      )
      .join("");
    assert.equal(text, "Final answer");
    assert.ok(
      run.session.events.some(
        (event) =>
          event.type === "metrics" &&
          JSON.stringify(event).includes("Anchored summary"),
      ),
    );
  } finally {
    run.close();
    await fixture.close();
  }
});

test("Pi drains edited/deleted steering messages after a text-only turn and UI acknowledges one batch", async () => {
  let run: ReturnType<typeof setup>;
  const fixture = await providerFixture((request, response, requests) => {
    if (requests.length === 1) {
      sessions.queueMessage(run.session, { id: "a", content: "old" });
      sessions.queueMessage(run.session, { id: "a", content: "edited" });
      sessions.queueMessage(run.session, { id: "deleted", content: "discard" });
      sessions.queueMessage(run.session, { id: "b", content: "second" });
      sessions.deleteQueuedMessage(run.session, "deleted");
    }
    reply(response, request.protocol, {
      text: requests.length === 1 ? "First" : "Follow-up",
    });
  });
  run = setup(fixture.baseUrl, 0);
  try {
    await runPiAgent(run.options);
    assert.equal(fixture.requests.length, 2);
    assert.equal(run.session.agent.hasQueuedMessages(), false);
    const users = fixture.requests[1].body.messages.filter(
      (message) => message.role === "user",
    );
    assert.deepEqual(
      users.slice(-2).map((message) => message.content),
      ["edited", "second"],
    );
    const acknowledged = run.session.events.filter(
      (event) => event.type === "queuedMessages",
    );
    assert.equal(acknowledged.length, 1);
    assert.ok(
      acknowledged[0].createdAt >
        Math.max(
          ...acknowledged[0].messages.map((message) => message.createdAt),
        ),
    );
    assert.deepEqual(
      acknowledged[0].messages.map((message) => message.id),
      ["a", "b"],
    );
  } finally {
    run.close();
    await fixture.close();
  }
});

test("deferred tools become executable and advertised on Pi's next turn", async () => {
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
                name: "loadTools",
                args: { names: ["manageMcpServers"] },
              },
            ],
          }
        : requests.length === 2
          ? {
              calls: [
                {
                  id: "list",
                  name: "manageMcpServers",
                  args: { operation: "list" },
                },
              ],
            }
          : { text: "Done" },
    ),
  );
  const run = setup(fixture.baseUrl, 3, {
    deferredBrowserTools: true,
    mcpManagement: true,
  });
  try {
    await runPiAgent(run.options);
    assert.equal(
      fixture.requests[0].body.tools.some(
        (tool) => tool.function.name === "manageMcpServers",
      ),
      false,
    );
    assert.equal(
      fixture.requests[1].body.tools.some(
        (tool) => tool.function.name === "manageMcpServers",
      ),
      true,
    );
    assert.match(JSON.stringify(toolResults(fixture.requests[2])), /servers/);
    assert.equal(
      run.session.agent.state.tools.some(
        (tool) => tool.name === "manageMcpServers",
      ),
      true,
    );
  } finally {
    run.close();
    await fixture.close();
  }
});

test("Pi validation rejects unknown tools and bad arguments without browser side effects", async () => {
  const query = mock.method(chrome.tabs, "query", async () => []);
  const fixture = await providerFixture((request, response, requests) =>
    reply(
      response,
      request.protocol,
      requests.length === 1
        ? {
            calls: [
              { id: "bad", name: "manageTabs", args: { operation: "invalid" } },
              { id: "unknown", name: "unknownTool", args: {} },
            ],
          }
        : { text: "Recovered" },
    ),
  );
  const run = setup(fixture.baseUrl);
  try {
    await runPiAgent(run.options);
    assert.equal(query.mock.callCount(), 0);
    assert.equal(toolResults(fixture.requests[1]).length, 2);
    assert.equal(
      run.session.events.filter(
        (event) =>
          event.type === "chunk" && event.chunk.state === "output-error",
      ).length,
      2,
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

test("question wait survives port disconnect/replay, accepts an answer and can be aborted", async () => {
  const fixture = await providerFixture((request, response, requests) =>
    reply(
      response,
      request.protocol,
      requests.length % 2 === 1
        ? {
            calls: [
              {
                id: "ask",
                name: "question",
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
          sessions.sendMessageToSession(run.session, {
            type: "answerQuestion",
            toolCallId: "ask",
            answers: [{ question: "Pick", answers: ["A"] }],
          });
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
      assert.equal(second.session.messageListeners.size, 0);
      assert.equal(second.session.disconnectListeners.size, 0);
      assert.equal(second.session.agent.state.isStreaming, false);
    } finally {
      second.close();
    }
  } finally {
    run.close();
    await fixture.close();
  }
});

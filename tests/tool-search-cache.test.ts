import assert from "node:assert/strict";
import { test } from "node:test";
import { runPiAgent } from "../src/background/pi-runtime";
import { createToolSet } from "../src/background/tools/registry";
import type { ChatMessage } from "../src/shared/types";
import { installPiRuntimeBrowser, setupPiRuntime } from "./pi-runtime-helpers";
import { providerFixture, reply } from "./provider-fixtures";

installPiRuntimeBrowser();

type Body = {
  tools?: Array<{ name?: string; function?: { name: string } }>;
  messages?: Array<{ role: string; content: unknown }>;
};
const toolNames = (body: Body) =>
  (body.tools || []).map((tool) => tool.name || tool.function?.name);

// One turn: load `workspace` with toolSearch, call a core tool, answer.
async function loadingTurn(
  provider: "anthropic" | "openai",
  options: { rejectInline?: boolean; history?: ChatMessage[] } = {},
) {
  const fixture = await providerFixture((request, response, requests) => {
    if (
      options.rejectInline &&
      JSON.stringify(request.body).includes("tool_addition")
    ) {
      response.writeHead(400, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          type: "error",
          error: {
            type: "invalid_request_error",
            message:
              "tool_addition/tool_removal is not supported on this model",
          },
        }),
      );
      return;
    }
    const answered = requests.filter(
      (item) => !JSON.stringify(item.body).includes("not supported"),
    ).length;
    reply(
      response,
      request.protocol,
      options.history
        ? { text: "Done" }
        : answered === 1
          ? {
              calls: [
                {
                  id: "load",
                  name: "toolSearch",
                  args: { names: ["workspace"] },
                },
              ],
            }
          : answered === 2
            ? {
                calls: [{ id: "list", name: "tabs", args: { action: "list" } }],
              }
            : { text: "Done" },
    );
  });
  const run = setupPiRuntime(fixture.baseUrl, provider);
  run.options.maxToolSteps = 5;
  run.options.setup.agent = { ...run.options.setup.agent, workspace: true };
  run.options.setup.workspace = {
    agentId: run.options.setup.agent.id,
    files: [],
  } as never;
  if (options.history) run.options.messages = options.history;
  try {
    await runPiAgent(run.options);
    return fixture.requests.map((request) => request.body as Body);
  } finally {
    run.close();
    await fixture.close();
  }
}

test("Anthropic: a loaded tool keeps the tool list and declares it after the prefix", async () => {
  const bodies = await loadingTurn("anthropic");
  assert.equal(bodies.length, 3);
  assert.deepEqual(toolNames(bodies[2]), toolNames(bodies[0]));
  assert.ok(!toolNames(bodies[0]).includes("workspace"));
  // The first request is a prefix of the third (cache marks move along).
  const unmarked = (value: unknown) =>
    JSON.stringify(value).replace(/,"cache_control":\{[^}]*\}/g, "");
  assert.equal(unmarked(bodies[2].tools), unmarked(bodies[0].tools));
  assert.equal(
    unmarked((bodies[2] as { system?: unknown }).system),
    unmarked((bodies[0] as { system?: unknown }).system),
  );
  assert.equal(
    unmarked(bodies[2].messages?.[0]),
    unmarked(bodies[0].messages?.[0]),
  );
  assert.match(
    JSON.stringify(bodies[2].messages),
    /"tool_addition".*"name":"workspace"/,
  );
});

test("Anthropic models without inline tools fall back to a longer tool list", async () => {
  const bodies = await loadingTurn("anthropic", { rejectInline: true });
  const last = bodies.at(-1)!;
  assert.ok(toolNames(last).includes("workspace"));
  assert.ok(!JSON.stringify(last).includes("tool_addition"));
});

test("a tool loaded in an earlier turn stays loaded for the chat", async () => {
  const openai = await loadingTurn("openai");
  assert.deepEqual(toolNames(openai[2]), [
    ...toolNames(openai[0]),
    "workspace",
  ]);
  const history: ChatMessage[] = [
    { id: "u1", role: "user", content: "Remember this", createdAt: 1 },
    {
      id: "a1",
      role: "assistant",
      content: "Noted.",
      createdAt: 2,
      parts: [
        {
          id: "p1",
          type: "tool-toolSearch",
          toolName: "toolSearch",
          output: { loaded: ["workspace"] },
        },
      ],
    },
    { id: "u2", role: "user", content: "And now?", createdAt: 3 },
  ];
  const [next] = await loadingTurn("openai", { history });
  assert.ok(toolNames(next).includes("workspace"));
  const [anthropic] = await loadingTurn("anthropic", { history });
  assert.ok(!toolNames(anthropic).includes("workspace"));
  assert.match(JSON.stringify(anthropic.messages), /"tool_addition"/);
});

test("toolSearch honours names and query together and matches any script", async () => {
  const setup = setupPiRuntime("http://127.0.0.1:9", "openai");
  setup.close();
  const run = {
    ...setup.options.setup,
    agent: { ...setup.options.setup.agent, workspace: true },
    workspace: { agentId: "a", files: [] },
    mcpServers: [
      {
        id: "notes",
        name: "Notes",
        url: "https://example.com/mcp",
        enabled: true,
        testedAt: 1,
        tools: [
          {
            name: "search_notes",
            description: "搜索笔记内容",
            enabled: true,
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
    ],
  } as never;
  const toolSet = createToolSet(run);
  const toolSearch = toolSet.find("toolSearch")!;
  const loaded = async (input: Record<string, unknown>) =>
    (await toolSearch.execute(input, {} as never)).details?.loaded;
  assert.deepEqual(await loaded({ names: ["workspace"], query: "delegate" }), [
    "workspace",
    "subAgent",
  ]);
  assert.deepEqual(await loaded({ query: "笔记" }), [
    "mcp__Notes__search_notes",
  ]);
});

test("toolSearch lists only tools not loaded yet and says what each load did", async () => {
  const setup = setupPiRuntime("http://127.0.0.1:9", "openai");
  setup.close();
  const run = {
    ...setup.options.setup,
    agent: { ...setup.options.setup.agent, workspace: true },
    workspace: { agentId: "a", files: [] },
  } as never;
  // `workspace` was loaded in an earlier turn of the chat.
  const toolSet = createToolSet(run, ["workspace"]);
  const toolSearch = toolSet.find("toolSearch")!;
  assert.doesNotMatch(toolSearch.description, /- workspace:/);
  assert.match(toolSearch.description, /- subAgent:/);
  assert.ok(toolSet.declared().some((tool) => tool.name === "workspace"));

  const result = await toolSearch.execute(
    { names: ["workspace", "subAgent", "tabs", "nope"] },
    {} as never,
  );
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.details, {
    loaded: ["workspace", "subAgent"],
    newlyLoaded: ["subAgent"],
    alreadyAvailable: ["tabs", "workspace"],
    notFound: ["nope"],
  });
  assert.equal(
    result.text,
    "Newly loaded: subAgent. Already available: tabs, workspace. Not found: nope. Call tools directly by these exact names.",
  );

  // Loading it again in the same run: already available, nothing new.
  const again = await toolSearch.execute({ names: ["subAgent"] }, {} as never);
  assert.deepEqual(again.details?.newlyLoaded, []);
  assert.deepEqual(again.details?.alreadyAvailable, ["subAgent"]);
});

import assert from "node:assert/strict";
import { mock, test } from "node:test";
import {
  ASK_AGENT,
  DEFAULT_AGENT,
  createAgentDraft,
  mayActUnattended,
  normalizeAgents,
} from "../src/shared/agents";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import { normalizeMcpServers } from "../src/shared/mcp";
import { keepStoredForm } from "../src/shared/stored-form";
import { storage } from "../src/shared/storage";
import { TOOL_NAME } from "../src/shared/tool-names";
import type { Agent, McpServerConfig } from "../src/shared/types";
import {
  BUILTIN_TOOLS,
  createToolSet,
  readingTool,
} from "../src/background/tools/registry";
import { runBackgroundChat } from "../src/background/sub-agent-run";
import * as sessions from "../src/background/stream-sessions";
import type { ToolSetup } from "../src/background/tools/types";
import { installPiRuntimeBrowser } from "./pi-runtime-helpers";
import { providerFixture, reply } from "./provider-fixtures";

installPiRuntimeBrowser();

const ALL_GROUPS_AGENT: Agent = {
  ...createAgentDraft("All"),
  id: "all",
  toolGroups: [
    "pages",
    "browser",
    "web",
    "images",
    "skills",
    "history",
    "subAgents",
    "mcp",
    "mcpServers",
    "localExecution",
    "devtools",
  ],
};

const MCP_SERVER = normalizeMcpServers([
  {
    id: "notes",
    name: "Notes",
    url: "https://mcp.test",
    enabled: true,
    testedAt: 1,
    tools: [
      { name: "search", enabled: true, readOnlyHint: true },
      { name: "write", enabled: true },
    ],
  },
]) as McpServerConfig[];

function setup(readOnly?: boolean, agent = ALL_GROUPS_AGENT): ToolSetup {
  return {
    agent,
    mcpServers: MCP_SERVER,
    preferences: DEFAULT_PREFERENCES,
    providers: {},
    depth: 0,
    workspace: { agentId: agent.id, files: [], createdAt: 0, updatedAt: 0 },
    unattended:
      readOnly === undefined
        ? undefined
        : { readOnly, needsUser: () => {}, report: () => {} },
  };
}

const names = (toolSet: ReturnType<typeof createToolSet>) => [
  ...toolSet.base().map((tool) => tool.name),
  ...toolSet.onDemand.map((tool) => tool.name),
];

test("every tool declares what its calls change", () => {
  for (const tool of BUILTIN_TOOLS)
    assert.ok(tool.effects, `${tool.name} declares effects`);
});

test("a read-only run does not see acting tools or acting actions", async () => {
  const toolSet = createToolSet(setup(true));
  const offered = names(toolSet);
  for (const acting of [
    TOOL_NAME.act,
    TOOL_NAME.editPage,
    TOOL_NAME.downloads,
    TOOL_NAME.runScript,
    TOOL_NAME.localCommand,
    TOOL_NAME.skills,
    TOOL_NAME.mcpServers,
    TOOL_NAME.scheduleTask,
    "mcp__Notes__write",
  ])
    assert.ok(!offered.includes(acting), `${acting} is not offered`);
  for (const reading of [
    TOOL_NAME.read,
    TOOL_NAME.snapshot,
    TOOL_NAME.find,
    TOOL_NAME.extract,
    TOOL_NAME.screenshot,
    TOOL_NAME.webSearch,
    TOOL_NAME.tabs,
    TOOL_NAME.taskResult,
    "mcp__Notes__search",
  ])
    assert.ok(offered.includes(reading), `${reading} is offered`);
  const tabs = toolSet.base().find((tool) => tool.name === TOOL_NAME.tabs)!;
  const actions = (
    tabs.parameters.properties as Record<string, { enum: string[] }>
  ).action.enum;
  assert.deepEqual(actions, ["list", "open"]);
  const refused = await tabs.execute(
    { action: "close", tabIds: [1] },
    {} as never,
  );
  assert.equal(refused.isError, true);
});

test("an agent that may act gets its acting tools, still within its groups", () => {
  const acting = names(createToolSet(setup(false)));
  assert.ok(acting.includes(TOOL_NAME.act));
  assert.ok(acting.includes("mcp__Notes__write"));
  // Ask has no browser group: acting never adds tools beyond the agent's.
  const ask = names(createToolSet(setup(false, ASK_AGENT)));
  assert.ok(!ask.includes(TOOL_NAME.act));
  // Outside task runs, nothing changes, and the task result tool is absent.
  const chat = names(createToolSet(setup(undefined)));
  assert.ok(chat.includes(TOOL_NAME.act));
  assert.ok(chat.includes(TOOL_NAME.scheduleTask));
  assert.ok(!chat.includes(TOOL_NAME.taskResult));
});

test("a tool whose actions all act is dropped; one that only reads is kept as is", () => {
  const read = BUILTIN_TOOLS.find((tool) => tool.name === TOOL_NAME.read)!;
  assert.equal(readingTool(read), read);
  const act = BUILTIN_TOOLS.find((tool) => tool.name === TOOL_NAME.act)!;
  assert.equal(readingTool(act), undefined);
});

test("MCP tools read only when the server says so (readOnlyHint)", () => {
  const [server] = MCP_SERVER;
  assert.equal(server.tools?.[0].readOnlyHint, true);
  assert.equal(server.tools?.[1].readOnlyHint, undefined);
});

// The 0.2.0 reader of stored agents (frozen copy of its normalizeAgent),
// to check that what this version stores still reads there.
function readAgentIn020(agent: Agent) {
  return {
    ...agent,
    name: agent.name.trim() || "Browse",
    prompt: typeof agent.prompt === "string" ? agent.prompt : "",
    workspace: agent.workspace !== false,
    createdAt: agent.createdAt || 0,
    updatedAt: agent.updatedAt || agent.createdAt || 0,
  };
}

test("agents of 0.2.0 read as not acting; built-ins never act", () => {
  // As 0.2.0 stored a custom agent.
  const stored = [
    {
      id: "custom",
      name: "Researcher",
      prompt: "",
      toolGroups: ["pages", "browser"],
      workspace: true,
      createdAt: 5,
      updatedAt: 6,
    },
  ] as unknown as Agent[];
  const agents = normalizeAgents(stored);
  const custom = agents.find((agent) => agent.id === "custom")!;
  assert.equal(custom.actUnattended, false);
  assert.equal(mayActUnattended(custom), false);
  // Read and saved without a change: the field is not written.
  assert.deepEqual(keepStoredForm(stored, agents, agents), stored);
  for (const builtin of [DEFAULT_AGENT, ASK_AGENT]) {
    const read = normalizeAgents([{ ...builtin, actUnattended: true }])[0];
    assert.equal(mayActUnattended(read), false, builtin.id);
  }
  assert.equal(createAgentDraft("New").actUnattended, false);
});

test("an agent this version stores keeps its permission through a 0.2.0 read and save", () => {
  const saved = { ...createAgentDraft("Buyer"), actUnattended: true };
  const old = readAgentIn020(saved);
  assert.equal(old.actUnattended, true);
  // 0.2.0 saving another field keeps the one it does not know.
  const edited = keepStoredForm([saved], [old], [{ ...old, prompt: "x" }]);
  assert.equal((edited as Agent[])[0].actUnattended, true);
});

async function offeredInTaskRun(agent: Agent) {
  const fixture = await providerFixture((request, response) =>
    reply(response, request.protocol, { text: "done" }),
  );
  mock.method(storage.provider, "get", async () => ({
    fx: {
      type: "openai",
      apiKey: "",
      baseUrl: `${fixture.baseUrl}/v1`,
      models: [{ id: "fixture", name: "fixture" }],
    },
  }));
  mock.method(storage.agents, "get", async () => [agent]);
  try {
    const run = await runBackgroundChat({
      agent,
      content: "check",
      title: "t",
      link: { kind: "normal", taskId: "task" },
      depth: 0,
      unattended: { needsUser: () => {}, report: () => {} },
      onStart: () => {},
    });
    sessions.abortSession(run.chatId);
    const tools = (fixture.requests[0].body.tools || []).map(
      (tool: { function?: { name: string }; name?: string }) =>
        tool.function?.name || tool.name,
    );
    return tools as string[];
  } finally {
    mock.restoreAll();
    await fixture.close();
  }
}

test("a task run of an agent without the permission is not offered act; with it, it is", async () => {
  const looking = await offeredInTaskRun({
    ...ALL_GROUPS_AGENT,
    actUnattended: false,
  });
  assert.ok(looking.includes(TOOL_NAME.read));
  assert.ok(looking.includes(TOOL_NAME.taskResult));
  assert.ok(!looking.includes(TOOL_NAME.act));
  const acting = await offeredInTaskRun({
    ...ALL_GROUPS_AGENT,
    actUnattended: true,
  });
  assert.ok(acting.includes(TOOL_NAME.act));
});

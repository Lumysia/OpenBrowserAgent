import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
  ASK_AGENT,
  DEFAULT_AGENT,
  createAgentDraft,
} from "../src/shared/agents";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import { storage } from "../src/shared/storage";
import { TOOL_NAME } from "../src/shared/tool-names";
import { agentActApproval } from "../src/shared/tasks/approval";
import { discardTask } from "../src/shared/tasks/edit";
import { idleReason } from "../src/shared/tasks/lifecycle";
import { loadRunContext } from "../src/shared/tasks/run-context";
import type { ScheduledTask } from "../src/shared/tasks/types";
import { badgeCount } from "../src/background/tasks/notify";
import { armTasks, runTask } from "../src/background/tasks/scheduler";
import { createToolSet, readingTool } from "../src/background/tools/registry";
import { tasksTool } from "../src/background/tools/tasks";
import type { ToolContext } from "../src/background/tools/types";
import { DEVICE, schedulerEnv, settle, task } from "./task-scheduler-env";

// The agent's task tool, action by action. The user asked for what it
// does in the chat, so it runs as made; only an agent's permission to act
// on its own that was not allowed on this device still waits.

afterEach(() => mock.restoreAll());

const AGENT = { ...createAgentDraft("Helper"), id: "custom" };

async function call(input: Record<string, unknown>) {
  const result = await tasksTool.execute(input, {
    run: { agent: AGENT },
    toolCallId: "call",
    progress() {},
  } as unknown as ToolContext);
  return {
    ...(result.details as Record<string, unknown>),
    isError: result.isError,
  } as Record<string, unknown>;
}

async function stored(id: string) {
  const [tasks, states, context] = await Promise.all([
    storage.tasks.get(),
    storage.taskStates.get(),
    loadRunContext(),
  ]);
  const found = tasks.find((item) => item.id === id) as ScheduledTask;
  const state = states[id] ?? { failures: 0 };
  return {
    task: found,
    state,
    reason: found && idleReason(found, state, context),
  };
}

test("list and get show each task's schedule, state and runs (read)", async () => {
  await schedulerEnv({
    tasks: [task(), task({ id: "t2", deviceId: "other" })],
  });
  await storage.chats.replace([
    {
      id: "run-1",
      title: "Prices",
      taskId: "t1",
      createdAt: 5,
      updatedAt: 5,
      messageCount: 2,
    },
    { id: "chat", title: "Other", createdAt: 6, updatedAt: 6, messageCount: 2 },
  ]);
  const list = await call({ action: "list" });
  assert.equal(list.count, 2);
  const [mine, other] = list.tasks as Array<Record<string, unknown>>;
  assert.equal(mine.schedule, "every 1 hours");
  assert.equal(mine.thisDevice, true);
  assert.equal(mine.status, "scheduled");
  assert.equal(other.status, "runs on another device");
  const got = await call({ action: "get", id: "t1" });
  assert.equal(got.prompt, "Check the prices");
  assert.deepEqual(got.recentRuns, [
    { chatId: "run-1", at: new Date(5).toISOString() },
  ]);
  assert.equal((await call({ action: "get", id: "nope" })).isError, true);
  // Reading actions stay in read-only runs; the others do not.
  const reading = readingTool(tasksTool)!;
  const actions = (
    reading.parameters.properties as Record<string, { enum: string[] }>
  ).action.enum;
  assert.deepEqual(actions, ["list", "get"]);
});

test("create makes a task that runs without a separate OK", async () => {
  const env = await schedulerEnv({ tasks: [] });
  const created = await call({
    action: "create",
    title: "News",
    prompt: "Summarize the news",
    kind: "interval",
    every: 2,
    unit: "hours",
  });
  assert.equal(created.waitingForOk, false);
  assert.equal(created.status, "scheduled");
  assert.doesNotMatch(String(created.note), /OK/);
  const id = String(created.taskId);
  assert.equal((await stored(id)).reason, undefined);
  // Nothing to notify or count on the badge.
  await armTasks();
  await settle();
  assert.equal(env.notifications.length, 0);
  const { task: made, state } = await stored(id);
  assert.equal(badgeCount([made], { [id]: state }, await loadRunContext()), 0);
  // The agent's runNow and the list's run now both run it.
  assert.equal((await call({ action: "runNow", id })).started, true);
  await settle();
  assert.equal(env.runs.length, 1);
});

test("a task of an agent whose acting is not allowed here still waits", async () => {
  const env = await schedulerEnv({ tasks: [] });
  // Turned on on another device: synced, not allowed here.
  const buyer = { ...AGENT, actUnattended: true };
  await storage.agents.replace([buyer]);
  const created = await call({
    action: "create",
    title: "Buy",
    prompt: "Buy the ticket when it is on sale",
    kind: "daily",
    time: "09:00",
  });
  assert.equal(created.waitingForOk, true);
  assert.match(String(created.note), /not allowed on this device yet/);
  const id = String(created.taskId);
  assert.equal((await stored(id)).reason, "needsOk");
  assert.equal(await runTask(id, { manual: true }), false);
  // The tool never allows the agent itself.
  assert.deepEqual(await storage.agentActApprovals.get(), {});
  // Allowed here (task list or agent settings): it runs.
  await storage.agentActApprovals.set({ [buyer.id]: agentActApproval(buyer) });
  assert.equal((await stored(id)).reason, undefined);
  assert.equal(await runTask(id, { manual: true }), true);
  assert.equal(env.runs.length, 1);
});

test("update, pause and resume run as made; discard goes back to what was allowed", async () => {
  await schedulerEnv();
  const renamed = await call({
    action: "update",
    id: "t1",
    title: "Price check",
  });
  assert.equal(renamed.waitingForOk, false);
  assert.equal((await stored("t1")).task.title, "Price check");
  const every = await call({ action: "update", id: "t1", every: 3 });
  assert.equal(every.waitingForOk, false);
  assert.deepEqual((await stored("t1")).task.trigger, {
    kind: "interval",
    every: 3,
    unit: "hours",
  });
  assert.equal((await stored("t1")).reason, undefined);
  // Same checks as the task list: no watch of a file.
  const bad = await call({
    action: "update",
    id: "t1",
    kind: "watch",
    url: "file:///etc",
  });
  assert.equal(bad.isError, true);
  assert.equal(
    (await call({ action: "pause", id: "t1" })).status,
    "paused by the user",
  );
  const resumed = await call({ action: "resume", id: "t1" });
  assert.equal(resumed.waitingForOk, false);
  assert.equal(resumed.status, "scheduled");
  // A synced change waits; Discard goes back to what was allowed.
  await storage.tasks.update((tasks) =>
    tasks.map((item) => ({ ...item, prompt: "Buy everything" })),
  );
  assert.equal((await stored("t1")).reason, "needsOk");
  await discardTask("t1");
  assert.equal((await stored("t1")).task.prompt, "Check the prices");
  assert.equal((await stored("t1")).reason, undefined);
});

test("update can name another agent but never changes what an agent may do", async () => {
  await schedulerEnv();
  const acting = {
    ...createAgentDraft("Buyer"),
    id: "buyer",
    actUnattended: false,
  };
  await storage.agents.replace([acting]);
  const moved = await call({ action: "update", id: "t1", agent: "Buyer" });
  assert.equal(moved.agent, "Buyer");
  assert.equal(moved.waitingForOk, false);
  assert.equal(
    (await call({ action: "update", id: "t1", agent: "Nobody" })).isError,
    true,
  );
  const [agent] = (await storage.agents.get()).filter(
    (item) => item.id === "buyer",
  );
  assert.equal(agent.actUnattended, false);
});

test("delete removes the task; discard of a synced task never allowed deletes it", async () => {
  await schedulerEnv();
  assert.equal((await call({ action: "delete", id: "t1" })).deleted, true);
  assert.equal((await storage.tasks.get()).length, 0);
  // As sync stores it: the definition, nothing allowed here.
  await storage.tasks.replace([task({ id: "synced" })]);
  assert.equal((await stored("synced")).reason, "needsOk");
  await discardTask("synced");
  assert.equal((await storage.tasks.get()).length, 0);
});

test("run now respects the device and the OK", async () => {
  const env = await schedulerEnv({
    tasks: [task(), task({ id: "t2", deviceId: "other" })],
  });
  assert.equal((await call({ action: "runNow", id: "t1" })).started, true);
  await settle();
  assert.equal(env.runs.length, 1);
  const refused = await call({ action: "runNow", id: "t2" });
  assert.equal(refused.isError, true);
  assert.match(String(refused.error), /another device/);
  assert.equal(DEVICE, "me");
});

test("the task tool belongs to the tasks group: Browse has it, Ask does not, task runs never", () => {
  const names = (agent: typeof DEFAULT_AGENT, unattended?: boolean) =>
    createToolSet({
      agent,
      mcpServers: [],
      preferences: DEFAULT_PREFERENCES,
      providers: {},
      depth: 0,
      ...(unattended
        ? { unattended: { readOnly: false, needsUser() {}, report() {} } }
        : {}),
    }).onDemand.map((tool) => tool.name);
  assert.ok(names(DEFAULT_AGENT).includes(TOOL_NAME.tasks));
  assert.ok(names(AGENT).includes(TOOL_NAME.tasks));
  assert.ok(!names(ASK_AGENT).includes(TOOL_NAME.tasks));
  assert.ok(!names(DEFAULT_AGENT, true).includes(TOOL_NAME.tasks));
});

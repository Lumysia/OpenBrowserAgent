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
import {
  approveTask,
  createTask,
  discardTask,
  updateTask,
} from "../src/shared/tasks/edit";
import { idleReason } from "../src/shared/tasks/lifecycle";
import { loadRunContext } from "../src/shared/tasks/run-context";
import type { ScheduledTask } from "../src/shared/tasks/types";
import { badgeCount } from "../src/background/tasks/notify";
import { armTasks, runTask } from "../src/background/tasks/scheduler";
import { createToolSet, readingTool } from "../src/background/tools/registry";
import { tasksTool } from "../src/background/tools/tasks";
import type { ToolContext } from "../src/background/tools/types";
import { DEVICE, schedulerEnv, settle, task } from "./task-scheduler-env";

// The agent's task tool, action by action, and the user's OK that what
// the agent creates, changes or turns on waits for.

afterEach(() => mock.restoreAll());

const USER = { approve: true };
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

test("create makes a task that waits for the user's OK, then runs once allowed", async () => {
  const env = await schedulerEnv({ tasks: [] });
  const created = await call({
    action: "create",
    title: "News",
    prompt: "Summarize the news",
    kind: "interval",
    every: 2,
    unit: "hours",
  });
  assert.equal(created.waitingForOk, true);
  assert.match(String(created.note), /waits for the user's OK/);
  const id = String(created.taskId);
  assert.equal((await stored(id)).reason, "needsOk");
  // Not run: not due, not by run now, not by the agent's runNow.
  await armTasks();
  await settle();
  assert.equal(env.runs.length, 0);
  assert.equal(await runTask(id, { manual: true }), false);
  assert.equal((await call({ action: "runNow", id })).isError, true);
  // Notified once, counted in the badge.
  await armTasks();
  assert.equal(env.notifications.length, 1);
  const { task: made, state } = await stored(id);
  assert.equal(badgeCount([made], { [id]: state }, await loadRunContext()), 1);
  await approveTask(id);
  assert.equal((await stored(id)).reason, undefined);
  assert.equal(await runTask(id, { manual: true }), true);
  assert.equal(env.runs.length, 1);
});

test("update changes what is asked; a real change or turning on waits again, a rename does not", async () => {
  await schedulerEnv();
  const renamed = await call({
    action: "update",
    id: "t1",
    title: "Price check",
  });
  assert.equal(renamed.waitingForOk, false);
  assert.equal((await stored("t1")).task.title, "Price check");
  const every = await call({ action: "update", id: "t1", every: 3 });
  assert.equal(every.waitingForOk, true);
  assert.deepEqual((await stored("t1")).task.trigger, {
    kind: "interval",
    every: 3,
    unit: "hours",
  });
  // Same checks as the task list: no watch of a file.
  const bad = await call({
    action: "update",
    id: "t1",
    kind: "watch",
    url: "file:///etc",
  });
  assert.equal(bad.isError, true);
  // Discard: back to what the user allowed.
  await discardTask("t1");
  assert.equal((await stored("t1")).task.trigger.kind, "interval");
  assert.deepEqual((await stored("t1")).task.trigger, task().trigger);
  assert.equal((await stored("t1")).reason, undefined);
  // Pausing needs no OK; turning back on does.
  assert.equal(
    (await call({ action: "pause", id: "t1" })).status,
    "paused by the user",
  );
  const resumed = await call({ action: "resume", id: "t1" });
  assert.equal(resumed.waitingForOk, true);
  // The task list's own edit is the user's: allowed as made.
  await updateTask("t1", { prompt: "Check all prices" }, USER);
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
  assert.equal(moved.waitingForOk, true);
  assert.equal(
    (await call({ action: "update", id: "t1", agent: "Nobody" })).isError,
    true,
  );
  const [agent] = (await storage.agents.get()).filter(
    (item) => item.id === "buyer",
  );
  assert.equal(agent.actUnattended, false);
});

test("delete removes the task; discard of a task never allowed deletes it", async () => {
  await schedulerEnv();
  assert.equal((await call({ action: "delete", id: "t1" })).deleted, true);
  assert.equal((await storage.tasks.get()).length, 0);
  const made = (await createTask(
    { title: "x", prompt: "y", agentId: "custom", trigger: task().trigger },
    { approve: false },
  ))!;
  await discardTask(made.id);
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

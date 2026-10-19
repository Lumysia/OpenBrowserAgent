import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { storage } from "../src/shared/storage";
import { createTask, updateTask } from "../src/shared/tasks/edit";
import { plannedRunAt } from "../src/shared/tasks/lifecycle";
import { observation } from "../src/shared/tasks/watch-text";
import type { ScheduledTask } from "../src/shared/tasks/types";
import { installChrome } from "./fake-chrome";

// Editing a task starts it over only when what it does or when it runs
// really changed; the form saves every field each time.

const here = { deviceId: "me", allPaused: false };
const HOUR = 60 * 60_000;

beforeEach(async () => {
  installChrome();
  await storage.taskDeviceId.set("me");
});

async function stored(id: string) {
  const task = (await storage.tasks.get()).find((item) => item.id === id)!;
  const state = (await storage.taskStates.get())[id] ?? { failures: 0 };
  return { task, state };
}

// What the task form saves: the whole draft.
const formSave = (task: ScheduledTask, patch: Partial<ScheduledTask>) =>
  updateTask(task.id, {
    title: task.title,
    prompt: task.prompt,
    agentId: task.agentId,
    trigger: task.trigger,
    deviceId: task.deviceId,
    ...patch,
  });

test("renaming a one-time task that ran keeps it done", async () => {
  const at = Date.now() - HOUR;
  const task = (await createTask({
    title: "Remind",
    prompt: "Say hi",
    agentId: "custom",
    trigger: { kind: "once", at },
  }))!;
  await storage.taskStates.set({
    [task.id]: { failures: 0, lastRunAt: at + 1_000 },
  });
  const saved = await formSave(task, { title: "Remind me" });
  assert.equal(saved?.title, "Remind me");
  const after = await stored(task.id);
  assert.equal(after.state.lastRunAt, at + 1_000);
  assert.equal(plannedRunAt(after.task, after.state, here), undefined);
});

test("saving a watch unchanged keeps its baseline and writes nothing", async () => {
  const task = (await createTask({
    title: "Price",
    prompt: "Tell me when it is below 50",
    agentId: "custom",
    trigger: { kind: "watch", url: "https://shop.test/", everyMinutes: 5 },
  }))!;
  const baseline = await observation("price 60", 1);
  await storage.taskStates.set({
    [task.id]: { failures: 0, lastRunAt: 10, nextRunAt: 20, baseline },
  });
  const same = await formSave(task, {});
  assert.equal(same?.updatedAt, task.updatedAt);
  await formSave(task, { title: "Price watch" });
  const after = await stored(task.id);
  assert.deepEqual(after.state.baseline, baseline);
  assert.equal(after.state.nextRunAt, 20);
});

test("a real change of the trigger or the prompt starts over", async () => {
  const task = (await createTask({
    title: "Price",
    prompt: "Tell me when it is below 50",
    agentId: "custom",
    trigger: { kind: "watch", url: "https://shop.test/", everyMinutes: 5 },
  }))!;
  const baseline = await observation("price 60", 1);
  const ran = { failures: 0, lastRunAt: 10, nextRunAt: 20, baseline };
  await storage.taskStates.set({ [task.id]: ran });
  await formSave(task, {
    trigger: { kind: "watch", url: "https://shop.test/", everyMinutes: 10 },
  });
  let after = await stored(task.id);
  assert.equal(after.state.baseline, undefined);
  assert.equal(after.state.lastRunAt, undefined);

  await storage.taskStates.set({ [task.id]: ran });
  await formSave(after.task, { prompt: "Tell me when it is below 40" });
  after = await stored(task.id);
  assert.equal(after.state.baseline, undefined);
});

test("an edit that makes no valid task is refused and stores nothing", async () => {
  const task = (await createTask({
    title: "Price",
    prompt: "Check",
    agentId: "custom",
    trigger: { kind: "interval", every: 2, unit: "hours" },
  }))!;
  const refused = await updateTask(task.id, {
    trigger: { kind: "watch", url: "file:///etc/passwd", everyMinutes: 5 },
  });
  assert.equal(refused, undefined);
  assert.deepEqual((await stored(task.id)).task.trigger, task.trigger);
  assert.equal(await updateTask("missing", { title: "x" }), undefined);
});

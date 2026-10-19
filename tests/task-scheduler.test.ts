import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { storage } from "../src/shared/storage";
import { createTask, deleteTask } from "../src/shared/tasks/edit";
import { ensureTaskDevice } from "../src/background/tasks/device";
import { TASK_MESSAGE } from "../src/shared/tasks/messages";
import {
  armTasks,
  handleTaskMessage,
  runTask,
} from "../src/background/tasks/scheduler";
import { reported, schedulerEnv, settle, task } from "./task-scheduler-env";

afterEach(() => mock.restoreAll());

function send(message: unknown) {
  return new Promise<unknown>((resolve) =>
    handleTaskMessage(message, (reply) => resolve(reply)),
  );
}

test("run now refuses a task another device runs", async () => {
  const env = await schedulerEnv({ tasks: [task({ deviceId: "other" })] });
  const reply = await send({ type: TASK_MESSAGE.runNow, taskId: "t1" });
  await settle();
  assert.deepEqual(reply, { ok: true, value: false });
  assert.equal(env.runs.length, 0);
  assert.equal(await runTask("t1", { manual: true }), false);
  assert.equal(env.runs.length, 0);
});

test("run now runs this device's task, even a paused one", async () => {
  const env = await schedulerEnv({ tasks: [task({ enabled: false })] });
  assert.equal(await runTask("t1", { manual: true }), true);
  assert.equal(env.runs.length, 1);
});

test("a task deleted during its run leaves no state and no notification", async () => {
  let release = () => {};
  const env = await schedulerEnv({
    run: () =>
      new Promise((resolve) => {
        release = () => resolve(reported());
      }),
  });
  const running = runTask("t1", { manual: true });
  await settle();
  await deleteTask("t1");
  release();
  await running;
  assert.deepEqual(await storage.taskStates.get(), {});
  assert.equal(env.notifications.length, 0);
});

test("states of tasks deleted on another device are dropped when arming", async () => {
  await schedulerEnv({
    tasks: [task({ deviceId: "other" })],
    states: {
      t1: { failures: 0 },
      gone: { failures: 0, unseen: true },
    },
  });
  await armTasks();
  assert.deepEqual(Object.keys(await storage.taskStates.get()), ["t1"]);
});

test("a copied profile takes a new task device id when sync gives it a new id", async () => {
  await schedulerEnv();
  await storage.taskDeviceId.set("");
  await storage.syncDeviceId.set("sync-1");
  const first = await ensureTaskDevice();
  assert.equal(await ensureTaskDevice(), first, "stable while sync's is");
  await createTask({
    title: "Mine",
    prompt: "p",
    agentId: "custom",
    trigger: { kind: "interval", every: 1, unit: "hours" },
  });
  // Sync found a copy of this profile and rotated its id.
  await storage.syncDeviceId.set("sync-2");
  const second = await ensureTaskDevice();
  assert.notEqual(second, first);
  const devices = (await storage.taskDevices.get()).map((device) => device.id);
  assert.ok(devices.includes(first) && devices.includes(second));
  // The old device's tasks stay listed under it, not run by the copy.
  const [mine] = (await storage.tasks.get()).filter((t) => t.title === "Mine");
  assert.equal(mine.deviceId, first);
  // A first sync id (sync turned on later) keeps the task id.
  await storage.taskDeviceSyncId.set("");
  await storage.syncDeviceId.set("sync-3");
  assert.equal(await ensureTaskDevice(), second);
});

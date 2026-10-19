import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { storage } from "../src/shared/storage";
import { deleteTask } from "../src/shared/tasks/edit";
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

import assert from "node:assert/strict";
import { test } from "node:test";
import { storage } from "../src/shared/storage";
import { setupTasks } from "../src/background/tasks/scheduler";
import { reported, schedulerEnv, settle, task } from "./task-scheduler-env";

// The worker's start in its own process: the scheduler starts once.

test("an alarm at the worker's start waits for the cut-off run's recovery", async () => {
  let attempt: number | undefined;
  const env = await schedulerEnv({
    tabs: [{ id: 9 }],
    states: {
      t1: {
        failures: 0,
        running: { startedAt: Date.now() - 60_000, attempt: 1, chatId: "c" },
        tabId: 9,
        nextRunAt: Date.now() + 60 * 60_000,
      },
    },
    run: async () => {
      attempt = (await storage.taskStates.get()).t1.running?.attempt;
      return reported();
    },
  });
  setupTasks();
  // The alarm that woke the worker, before the start's recovery ran.
  env.onAlarm.emit({ name: "task:t1" });
  await settle(100);
  assert.equal(env.runs.length, 1, "it runs once");
  assert.equal(attempt, 2, "as the retry of the cut-off run");
  assert.deepEqual(env.removed, [9], "the cut-off run's tab is closed");
  assert.equal(task().id, "t1");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  afterRun,
  idleReason,
  nextAttempt,
  plannedRunAt,
  recoverInterrupted,
} from "../src/shared/tasks/lifecycle";
import {
  normalizeTask,
  normalizeTaskStates,
  normalizeTrigger,
} from "../src/shared/tasks/normalize";
import {
  TASK_LIMITS,
  TASK_PAUSE,
  TASK_RESULT,
  type ScheduledTask,
  type TaskState,
} from "../src/shared/tasks/types";

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;

function task(patch: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: "t1",
    title: "Prices",
    prompt: "Tell me when the price drops",
    agentId: "general-agent",
    trigger: { kind: "watch", url: "https://shop.test/item", everyMinutes: 5 },
    deviceId: "me",
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

const here = { deviceId: "me", allPaused: false };
const fresh: TaskState = { failures: 0 };
const failedRun = {
  failed: true,
  result: { status: TASK_RESULT.failed, at: NOW },
} as const;

test("normalization clamps intervals and drops tasks without a usable trigger", () => {
  assert.deepEqual(
    normalizeTrigger({ kind: "watch", url: "https://a.test", everyMinutes: 0 }),
    {
      kind: "watch",
      url: "https://a.test/",
      everyMinutes: TASK_LIMITS.minWatchMinutes,
    },
  );
  assert.equal(
    (
      normalizeTrigger({ kind: "watch", url: "https://a.test" }) as {
        everyMinutes: number;
      }
    ).everyMinutes,
    TASK_LIMITS.defaultWatchMinutes,
  );
  assert.equal(
    normalizeTrigger({ kind: "watch", url: "file:///etc" }),
    undefined,
  );
  assert.equal(normalizeTrigger({ kind: "cron" }), undefined);
  assert.deepEqual(
    normalizeTrigger({ kind: "weekly", time: "7:5", days: [9, 2, 2] }),
    {
      kind: "weekly",
      time: "09:00",
      days: [2],
    },
  );
  assert.deepEqual(
    normalizeTrigger({ kind: "interval", every: "0", unit: "weeks" }),
    {
      kind: "interval",
      every: 1,
      unit: "hours",
    },
  );
  assert.equal(
    normalizeTask({ id: "x", trigger: { kind: "once" } }),
    undefined,
  );
  const read = normalizeTask({
    id: "x",
    prompt: " p ",
    trigger: { kind: "daily", time: "08:15" },
    futureField: 1,
  })!;
  assert.equal(read.agentId, "general-agent");
  assert.equal(read.enabled, true);
  assert.equal(read.createdAt, 0);
  // Fields a newer version adds stay as they are.
  assert.equal((read as Record<string, unknown>).futureField, 1);
});

test("a task runs only on its own device, and not while paused", () => {
  assert.equal(idleReason(task(), fresh, here), undefined);
  assert.equal(
    idleReason(task({ deviceId: "other" }), fresh, here),
    "otherDevice",
  );
  assert.equal(idleReason(task({ deviceId: "" }), fresh, here), "otherDevice");
  assert.equal(idleReason(task({ enabled: false }), fresh, here), "disabled");
  assert.equal(
    idleReason(task(), { ...fresh, pausedBy: TASK_PAUSE.failures }, here),
    TASK_PAUSE.failures,
  );
  assert.equal(
    idleReason(task(), fresh, { ...here, allPaused: true }),
    "allPaused",
  );
  assert.equal(
    plannedRunAt(task({ deviceId: "other" }), fresh, here),
    undefined,
  );
  // A new watch looks at once.
  assert.equal(plannedRunAt(task(), fresh, here), NOW);
});

test("failures in a row pause the task and notify once; a success resets them", () => {
  let state = fresh;
  for (let run = 1; run < TASK_LIMITS.failuresToPause; run++) {
    const next = afterRun(task(), state, failedRun, NOW);
    assert.equal(next.notice, null);
    assert.equal(next.state.failures, run);
    assert.equal(next.state.pausedBy, undefined);
    assert.equal(next.state.nextRunAt, NOW + 5 * MINUTE);
    state = next.state;
  }
  const paused = afterRun(task(), state, failedRun, NOW);
  assert.equal(paused.notice, "paused");
  assert.equal(paused.state.pausedBy, TASK_PAUSE.failures);
  assert.equal(paused.state.nextRunAt, undefined);
  assert.equal(plannedRunAt(task(), paused.state, here), undefined);
  const ok = afterRun(
    task(),
    { ...state, failures: 2 },
    { failed: false, result: { status: TASK_RESULT.notMet, at: NOW } },
    NOW,
  );
  assert.equal(ok.state.failures, 0);
});

test("a watch keeps its baseline through unchanged and failed checks", () => {
  const baseline = { hash: "a", text: "old", at: 1 };
  const changed = { hash: "b", text: "new", at: 2 };
  const state: TaskState = {
    ...fresh,
    baseline,
    lastResult: { status: TASK_RESULT.notMet, at: 1, chatId: "c1" },
  };
  const failed = afterRun(
    task(),
    state,
    { ...failedRun, baseline: changed },
    NOW,
  );
  assert.deepEqual(failed.state.baseline, baseline);
  const unchanged = afterRun(
    task(),
    state,
    {
      failed: false,
      baseline,
      result: { status: TASK_RESULT.unchanged, at: NOW },
    },
    NOW,
  );
  // No model run: the last result (and its chat) stays what it was.
  assert.equal(unchanged.notice, null);
  assert.equal(unchanged.state.lastResult?.chatId, "c1");
  const met = afterRun(
    task(),
    state,
    {
      failed: false,
      baseline: changed,
      result: { status: TASK_RESULT.met, at: NOW, chatId: "c2", summary: "49" },
    },
    NOW,
  );
  assert.equal(met.notice, "met");
  assert.equal(met.state.unseen, true);
  assert.deepEqual(met.state.baseline, changed);
});

test("a run that needs the user pauses a recurring task and notifies", () => {
  const end = afterRun(
    task(),
    fresh,
    {
      failed: false,
      result: { status: TASK_RESULT.needsUser, at: NOW, chatId: "c" },
    },
    NOW,
  );
  assert.equal(end.notice, "needsUser");
  assert.equal(end.state.pausedBy, TASK_PAUSE.needsUser);
  const once = afterRun(
    task({ trigger: { kind: "once", at: NOW } }),
    fresh,
    { failed: false, result: { status: TASK_RESULT.reported, at: NOW } },
    NOW,
  );
  assert.equal(once.notice, "result");
  assert.equal(once.state.nextRunAt, undefined);
});

test("a run cut off by a worker restart is retried once, then counts as failed", () => {
  const cut: TaskState = {
    ...fresh,
    running: { startedAt: NOW - MINUTE, attempt: 1, chatId: "c" },
  };
  const first = recoverInterrupted(task(), cut, NOW);
  assert.equal(first.retry, true);
  assert.equal(first.state.running, undefined);
  assert.equal(first.state.nextRunAt, NOW);
  assert.equal(nextAttempt(first.state), 2);
  const second = recoverInterrupted(
    task(),
    { ...cut, running: { startedAt: NOW, attempt: 2 } },
    NOW,
  );
  assert.equal(second.retry, false);
  assert.equal(second.state.failures, 1);
  assert.equal(second.state.running, undefined);
  assert.equal(nextAttempt(second.state), 1);
});

test("stored states read back in today's form", () => {
  const states = normalizeTaskStates({
    t1: {
      failures: "2",
      pausedBy: "nonsense",
      lastResult: { status: "met", at: 5, summary: "x" },
      baseline: { hash: "h", text: "y".repeat(TASK_LIMITS.baselineChars + 10) },
    },
  });
  assert.equal(states.t1.failures, 2);
  assert.equal(states.t1.pausedBy, undefined);
  assert.equal(states.t1.lastResult?.status, TASK_RESULT.met);
  assert.equal(states.t1.baseline?.text.length, TASK_LIMITS.baselineChars);
});

test("a watch notifies when its condition comes to hold, not again while it holds", () => {
  const met = (at: number) => ({
    failed: false,
    result: { status: TASK_RESULT.met, at },
  });
  const notMet = {
    failed: false,
    result: { status: TASK_RESULT.notMet, at: NOW },
  };
  let state = fresh;
  const notices: Array<string | null> = [];
  for (const end of [met(1), met(2), notMet, met(3), met(4)]) {
    const next = afterRun(task(), state, end, NOW);
    notices.push(next.notice);
    state = next.state;
  }
  assert.deepEqual(notices, ["met", null, null, "met", null]);
  // Unchanged, failed and unjudged checks do not reset it.
  for (const end of [
    { failed: false, result: { status: TASK_RESULT.unchanged, at: NOW } },
    failedRun,
    { failed: false, result: { status: TASK_RESULT.answered, at: NOW } },
  ])
    state = afterRun(task(), state, end, NOW).state;
  assert.equal(afterRun(task(), state, met(5), NOW).notice, null);
});

test("a run without its outcome is shown but never notified", () => {
  const timeTask = task({
    trigger: { kind: "interval", every: 1, unit: "minutes" },
  });
  let state = fresh;
  for (let run = 0; run < 3; run++) {
    const next = afterRun(
      timeTask,
      state,
      {
        failed: false,
        result: { status: TASK_RESULT.answered, at: NOW, summary: "text" },
      },
      NOW,
    );
    assert.equal(next.notice, null);
    assert.equal(next.state.unseen, undefined);
    assert.equal(next.state.lastResult?.status, TASK_RESULT.answered);
    state = next.state;
  }
});

test("the baseline advances only after a verdict", () => {
  const baseline = { hash: "a", text: "old", at: 1 };
  const seen = { hash: "b", text: "new", at: 2 };
  const state: TaskState = { ...fresh, baseline };
  for (const status of [TASK_RESULT.needsUser, TASK_RESULT.answered]) {
    const next = afterRun(
      task(),
      state,
      { failed: false, baseline: seen, result: { status, at: NOW } },
      NOW,
    );
    assert.deepEqual(next.state.baseline, baseline, status);
  }
  const judged = afterRun(
    task(),
    state,
    {
      failed: false,
      baseline: seen,
      result: { status: TASK_RESULT.notMet, at: NOW },
    },
    NOW,
  );
  assert.deepEqual(judged.state.baseline, seen);
});

test("a run that could not reach its page is no failure and changes nothing", () => {
  const baseline = { hash: "a", text: "old", at: 1 };
  const state: TaskState = {
    ...fresh,
    failures: 2,
    baseline,
    lastResult: { status: TASK_RESULT.notMet, at: 1 },
    running: { startedAt: NOW, attempt: 1 },
  };
  const skipped = {
    failed: false,
    skipped: true,
    result: { status: TASK_RESULT.unchanged, at: NOW },
  };
  const next = afterRun(task(), state, skipped, NOW);
  assert.equal(next.notice, null);
  assert.equal(next.state.failures, 2);
  assert.equal(next.state.pausedBy, undefined);
  assert.deepEqual(next.state.baseline, baseline);
  assert.equal(next.state.lastResult?.status, TASK_RESULT.notMet);
  assert.equal(next.state.running, undefined);
  assert.equal(next.state.nextRunAt, NOW + 5 * MINUTE);
  // A one-time task tries again later.
  const once = afterRun(
    task({ trigger: { kind: "once", at: NOW } }),
    fresh,
    skipped,
    NOW,
  );
  assert.ok(once.state.nextRunAt! > NOW);
});

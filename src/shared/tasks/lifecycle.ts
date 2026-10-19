import { isRecurring, nextRunAt } from "./schedule";
import {
  TASK_LIMITS,
  TASK_PAUSE,
  TASK_RESULT,
  type ScheduledTask,
  type TaskResult,
  isVerdict,
  type TaskState,
  type WatchBaseline,
} from "./types";

// The decisions of a task's life, kept apart from timers and storage so
// they can be tested: when it runs next, what a run's end changes, and
// what a run cut off by a worker restart becomes.

// A run cut off once is retried once; a second cut-off counts as a failure.
const MAX_ATTEMPTS = 2;
// A one-time task that failed tries again after this, times its failures.
const ONCE_RETRY_MS = 5 * 60_000;

export type RunContext = {
  // This device's id among the task devices.
  deviceId: string;
  // The global switch in settings.
  allPaused: boolean;
};

// Why a task is not scheduled here, or undefined when it is.
export function idleReason(
  task: ScheduledTask,
  state: TaskState,
  context: RunContext,
) {
  if (!task.deviceId || task.deviceId !== context.deviceId)
    return "otherDevice" as const;
  if (!task.enabled) return "disabled" as const;
  if (state.pausedBy) return state.pausedBy;
  if (context.allPaused) return "allPaused" as const;
  return undefined;
}

// When the task runs next on this device; undefined when it does not (it
// is not this device's, paused, or a one-time task that ran). A time in the
// past is due now.
export function plannedRunAt(
  task: ScheduledTask,
  state: TaskState,
  context: RunContext,
) {
  if (idleReason(task, state, context)) return undefined;
  if (state.nextRunAt !== undefined) return state.nextRunAt;
  return nextRunAt(task.trigger, {
    from: state.lastRunAt ?? task.updatedAt,
    ran: state.lastRunAt !== undefined,
  });
}

export type RunEnd = {
  result: TaskResult;
  failed: boolean;
  // What a watch saw; it becomes the baseline only after a verdict.
  baseline?: WatchBaseline;
  // The run could not reach its page (offline, load error): it is no
  // failure and changes nothing but the next run's time.
  skipped?: boolean;
};

export type Notice = "result" | "met" | "needsUser" | "paused";

// The task's state after a run, and what to tell the user.
export function afterRun(
  task: ScheduledTask,
  state: TaskState,
  end: RunEnd,
  now: number,
): { state: TaskState; notice: Notice | null } {
  if (end.skipped)
    return {
      notice: null,
      state: {
        ...state,
        running: undefined,
        retrying: undefined,
        nextRunAt:
          task.trigger.kind === "once"
            ? now + ONCE_RETRY_MS
            : nextRunAt(task.trigger, { from: now, ran: true }),
      },
    };
  const failures = end.failed ? state.failures + 1 : 0;
  const pausedBy =
    failures >= TASK_LIMITS.failuresToPause
      ? TASK_PAUSE.failures
      : end.result.status === TASK_RESULT.needsUser && isRecurring(task.trigger)
        ? TASK_PAUSE.needsUser
        : undefined;
  const ran = { from: now, ran: true };
  const nextRunAtValue = pausedBy
    ? undefined
    : end.failed && task.trigger.kind === "once"
      ? now + ONCE_RETRY_MS * failures
      : nextRunAt(task.trigger, ran);
  const { status } = end.result;
  const verdict = !end.failed && isVerdict(status);
  const notice: Notice | null =
    pausedBy === TASK_PAUSE.failures
      ? "paused"
      : status === TASK_RESULT.reported
        ? "result"
        : status === TASK_RESULT.met && !state.conditionMet
          ? "met"
          : status === TASK_RESULT.needsUser
            ? "needsUser"
            : null;
  return {
    notice,
    state: {
      ...state,
      running: undefined,
      retrying: undefined,
      lastRunAt: now,
      nextRunAt: nextRunAtValue,
      // A watch check that did not run the model keeps the last result.
      lastResult:
        end.result.status === TASK_RESULT.unchanged && state.lastResult
          ? state.lastResult
          : end.result,
      unseen: notice ? true : state.unseen,
      failures,
      pausedBy,
      // Only a verdict replaces the baseline: after a failed check, a
      // question or a run that never judged, the change is judged again.
      baseline: verdict ? (end.baseline ?? state.baseline) : state.baseline,
      conditionMet:
        status === TASK_RESULT.met
          ? true
          : status === TASK_RESULT.notMet
            ? false
            : state.conditionMet,
    },
  };
}

// A run still marked as running when the worker starts was cut off: it is
// retried once, then counted as a failed run.
export function recoverInterrupted(
  task: ScheduledTask,
  state: TaskState,
  now: number,
): { state: TaskState; retry: boolean; notice: Notice | null } {
  const running = state.running;
  if (!running) return { state, retry: false, notice: null };
  if (running.attempt < MAX_ATTEMPTS)
    return {
      state: { ...state, running: undefined, nextRunAt: now, retrying: true },
      retry: true,
      notice: null,
    };
  const end = afterRun(
    task,
    state,
    {
      failed: true,
      result: {
        status: TASK_RESULT.failed,
        at: now,
        chatId: running.chatId,
      },
    },
    now,
  );
  return { ...end, retry: false };
}

// The attempt the next run is: a retry of a cut-off run is the second.
export function nextAttempt(state: TaskState) {
  return state.retrying ? MAX_ATTEMPTS : 1;
}

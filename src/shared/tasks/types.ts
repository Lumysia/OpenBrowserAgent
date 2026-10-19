// Scheduled tasks and page watches. A task's definition syncs (settings
// group); it runs only on the device that owns it. What a device learns
// while running it (TaskState) stays on that device.

export const TASK_LIMITS = {
  // A watch reads its page at most once a minute.
  minWatchMinutes: 1,
  defaultWatchMinutes: 5,
  maxIntervalCount: 999,
  titleChars: 120,
  promptChars: 4_000,
  // Failed runs in a row that pause a task.
  failuresToPause: 3,
  // What a watch keeps of the page to show the model what changed.
  baselineChars: 20_000,
  // Lines a baseline keeps a key for; the rest share the last key.
  baselineLines: 50_000,
  // How much of each side of a change the model gets.
  changeChars: 8_000,
  // Lines of unchanged text kept around a change.
  changeContextLines: 3,
  summaryChars: 280,
} as const;

export const INTERVAL_UNITS = ["minutes", "hours", "days"] as const;
export type IntervalUnit = (typeof INTERVAL_UNITS)[number];

export const TRIGGER_KINDS = [
  "once",
  "interval",
  "daily",
  "weekly",
  "watch",
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export type TaskTrigger =
  | { kind: "once"; at: number }
  | { kind: "interval"; every: number; unit: IntervalUnit }
  // `time` is "HH:MM" in the user's local time zone.
  | { kind: "daily"; time: string }
  // `days`: 0 (Sunday) to 6, as Date.getDay().
  | { kind: "weekly"; time: string; days: number[] }
  // `selector`: the part of the page to watch (a structural CSS path);
  // none watches the page's main readable text.
  | { kind: "watch"; url: string; selector?: string; everyMinutes: number };

export type ScheduledTask = {
  id: string;
  title: string;
  // What the agent is asked to do; for a watch, the condition and what to
  // report when it holds.
  prompt: string;
  agentId: string;
  trigger: TaskTrigger;
  // The device that runs it (TaskDevice.id).
  deviceId: string;
  // Off: paused by the user.
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

// A device that can run tasks, listed so a task's owner can be changed.
export type TaskDevice = { id: string; name: string; seenAt: number };

export const TASK_RESULT = {
  // A time task's run that has something to tell.
  reported: "reported",
  // A run that found nothing worth telling.
  nothing: "nothing",
  // A watch whose condition holds.
  met: "met",
  // A watch that checked a change and found the condition does not hold.
  notMet: "notMet",
  // A watch whose page did not change: no model run.
  unchanged: "unchanged",
  // A run that ended without its verdict (no taskResult call, or an
  // error after a partial answer): shown, but not notified and a watch
  // keeps its baseline.
  answered: "answered",
  needsUser: "needsUser",
  failed: "failed",
} as const;
export type TaskResultStatus = (typeof TASK_RESULT)[keyof typeof TASK_RESULT];

export type TaskResult = {
  status: TaskResultStatus;
  at: number;
  // The run's chat (none for a watch check without a model run).
  chatId?: string;
  summary?: string;
};

export const TASK_PAUSE = {
  failures: "failures",
  needsUser: "needsUser",
} as const;
export type TaskPause = (typeof TASK_PAUSE)[keyof typeof TASK_PAUSE];

// What a watch keeps of the page it saw: the hash of the whole text, a
// short key per line (where a change is, however long the page), and the
// text of its first and last lines within baselineChars (`text`, `tail`)
// to show the model what was there before.
export type WatchBaseline = {
  hash: string;
  text: string;
  tail?: string;
  lines?: string;
  at: number;
};

export type TaskState = {
  nextRunAt?: number;
  lastRunAt?: number;
  // A run in progress; still set when the worker stopped during it.
  running?: { chatId?: string; startedAt: number; attempt: number };
  // The next run retries one cut off by a worker restart.
  retrying?: boolean;
  lastResult?: TaskResult;
  // The last result the user has not seen in the task list.
  unseen?: boolean;
  failures: number;
  pausedBy?: TaskPause;
  baseline?: WatchBaseline;
  // A watch's condition held at its last verdict: a met check notifies
  // only when it did not (no repeat while it keeps holding).
  conditionMet?: boolean;
  // The helper tab a run reads its page in, closed when the run ends (or
  // at the next start, after a run was cut off).
  tabId?: number;
};

export type TaskStates = Record<string, TaskState>;

// Results that judged what the run was for: only after one does a watch
// take the page it saw as its new baseline.
export function isVerdict(status: TaskResultStatus) {
  return (
    status === TASK_RESULT.reported ||
    status === TASK_RESULT.nothing ||
    status === TASK_RESULT.met ||
    status === TASK_RESULT.notMet ||
    status === TASK_RESULT.unchanged
  );
}

// Results that are worth telling the user (notification, badge).
export function isNotableResult(status: TaskResultStatus | undefined) {
  return (
    status === TASK_RESULT.reported ||
    status === TASK_RESULT.met ||
    status === TASK_RESULT.needsUser
  );
}

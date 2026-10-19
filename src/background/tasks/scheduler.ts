import { getBrowserApi } from "../../shared/browser-api";
import { storage } from "../../shared/storage";
import { updateTaskState } from "../../shared/tasks/edit";
import {
  afterRun,
  idleReason,
  nextAttempt,
  plannedRunAt,
  recoverInterrupted,
  type Notice,
  type RunContext,
  type RunEnd,
} from "../../shared/tasks/lifecycle";
import { taskState } from "../../shared/tasks/normalize";
import { TASK_RESULT, type ScheduledTask } from "../../shared/tasks/types";
import { errorMessage } from "../../shared/error-message";
import { respondWith } from "../../shared/runtime-messages";
import { isTaskMessage, TASK_MESSAGE } from "../../shared/tasks/messages";
import { ensureTaskDevice } from "./device";
import {
  notifyTask,
  setupTaskNotificationClicks,
  updateTaskBadge,
} from "./notify";
import { runTimeTask, runWatch } from "./runner";
import { closeTaskTab } from "./watch-page";

// Runs the tasks this device owns, on chrome.alarms (one alarm per task,
// named apart from sync's), so they survive the service worker stopping.
// Alarms are set again whenever the worker starts or tasks change.

export const TASK_ALARM_PREFIX = "task:";

const alarmName = (taskId: string) => `${TASK_ALARM_PREFIX}${taskId}`;

// Tasks running in this worker; a task never runs twice at once.
const active = new Set<string>();
// Runs go one at a time: several tasks due together wait their turn.
let queue: Promise<unknown> = Promise.resolve();

async function runContext(): Promise<RunContext> {
  const [deviceId, preferences] = await Promise.all([
    storage.taskDeviceId.get(),
    storage.preferences.get(),
  ]);
  return { deviceId, allPaused: preferences.tasksPaused === true };
}

async function findTask(taskId: string) {
  return (await storage.tasks.get()).find((task) => task.id === taskId);
}

// Sets one alarm per task due on this device and clears the others; the
// planned time is kept in the task's state for the task list.
export async function armTasks() {
  const api = getBrowserApi();
  if (!api.alarms) return;
  const [tasks, states, context] = await Promise.all([
    storage.tasks.get(),
    storage.taskStates.get(),
    runContext(),
  ]);
  const planned = new Map<string, number>();
  for (const task of tasks) {
    const at = plannedRunAt(task, taskState(states, task.id), context);
    if (at !== undefined) planned.set(task.id, at);
  }
  // What the list shows as the next run (before any run below changes it).
  const changed = [...planned].filter(
    ([taskId, at]) => taskState(states, taskId).nextRunAt !== at,
  );
  if (changed.length)
    await storage.taskStates.update((current) => {
      const next = { ...current };
      for (const [taskId, at] of changed)
        next[taskId] = { ...taskState(current, taskId), nextRunAt: at };
      return next;
    });
  // Due now (new, missed while the browser was closed, or a retry): run
  // at once rather than wait for the browser's least alarm delay.
  const now = Date.now();
  const due = [...planned]
    .filter(([, at]) => at <= now)
    .map(([taskId]) => taskId);
  const alarms = await api.alarms.getAll();
  await Promise.all(
    alarms
      .filter((alarm) => {
        const taskId = alarm.name.slice(TASK_ALARM_PREFIX.length);
        return (
          alarm.name.startsWith(TASK_ALARM_PREFIX) &&
          (!planned.has(taskId) || due.includes(taskId))
        );
      })
      .map((alarm) => api.alarms.clear(alarm.name)),
  );
  for (const taskId of due)
    void runTask(taskId).catch((error: unknown) =>
      console.warn("Scheduled task failed", error),
    );
  for (const [taskId, at] of planned) {
    if (due.includes(taskId)) continue;
    const existing = alarms.find((alarm) => alarm.name === alarmName(taskId));
    if (existing && Math.abs(existing.scheduledTime - at) < 1_000) continue;
    await api.alarms.create(alarmName(taskId), {
      when: Math.max(at, Date.now()),
    });
  }
}

// Runs a task now, whatever its schedule (an alarm, or the user's "run
// now"). Does nothing when it is running already or is not this device's
// to run; "run now" also runs a paused task.
export function runTask(taskId: string, { manual = false } = {}) {
  if (active.has(taskId)) return Promise.resolve(false);
  active.add(taskId);
  const run = queue.then(() => runQueued(taskId, manual));
  queue = run.catch(() => undefined);
  return run.finally(() => active.delete(taskId));
}

async function runQueued(taskId: string, manual: boolean) {
  const task = await findTask(taskId);
  if (!task) return false;
  const context = await runContext();
  const state = taskState(await storage.taskStates.get(), taskId);
  const reason = idleReason(task, state, context);
  if (reason === "otherDevice" || (reason && !manual)) return false;
  const attempt = nextAttempt(state);
  await updateTaskState(taskId, (current) => ({
    ...current,
    retrying: undefined,
    running: { startedAt: Date.now(), attempt },
  }));
  const hooks = {
    onChat: (chatId: string) =>
      void updateTaskState(taskId, (current) => ({
        ...current,
        running: current.running && { ...current.running, chatId },
      })),
    onTab: (tabId: number | undefined) =>
      void updateTaskState(taskId, (current) => ({ ...current, tabId })),
  };
  let end: RunEnd;
  try {
    end =
      task.trigger.kind === "watch"
        ? await runWatch(task, state.baseline, hooks)
        : await runTimeTask(task, hooks);
  } catch (error) {
    end = {
      failed: true,
      result: {
        status: TASK_RESULT.failed,
        at: Date.now(),
        summary: errorMessage(error),
      },
    };
  }
  await finishRun(task, end, manual);
  return true;
}

async function finishRun(task: ScheduledTask, end: RunEnd, manual: boolean) {
  let notice: Notice | null = null;
  await storage.taskStates.update((states) => {
    const current = taskState(states, task.id);
    const next = afterRun(task, current, end, Date.now());
    notice = next.notice;
    // Running a paused task by hand leaves it paused by the user.
    const state =
      manual && !task.enabled
        ? { ...next.state, nextRunAt: undefined }
        : next.state;
    return { ...states, [task.id]: state };
  });
  if (notice) await notifyTask(task, notice, end.result);
  await armTasks();
}

// After the worker (re)starts: runs cut off by a stop are retried once, and
// their helper tabs closed.
async function recoverTasks() {
  const tasks = await storage.tasks.get();
  const now = Date.now();
  const notices: Array<[ScheduledTask, Notice]> = [];
  const tabs: number[] = [];
  await storage.taskStates.update((states) => {
    const next = { ...states };
    for (const task of tasks) {
      const state = taskState(states, task.id);
      if (!state.running || active.has(task.id)) continue;
      if (state.tabId !== undefined) tabs.push(state.tabId);
      const recovered = recoverInterrupted(task, state, now);
      next[task.id] = { ...recovered.state, tabId: undefined };
      if (recovered.notice) notices.push([task, recovered.notice]);
    }
    return next;
  });
  await Promise.all(tabs.map(closeTaskTab));
  for (const [task, notice] of notices)
    await notifyTask(task, notice, {
      status: TASK_RESULT.failed,
      at: now,
    });
}

// The badge counts results the user has not seen in the task list.
export async function markTasksSeen() {
  await storage.taskStates.update((states) =>
    Object.values(states).some((state) => state.unseen)
      ? Object.fromEntries(
          Object.entries(states).map(([id, state]) => [
            id,
            { ...state, unseen: undefined },
          ]),
        )
      : states,
  );
}

// A task the scheduler paused starts over: no failures, the schedule
// counted from now.
async function resumeTask(taskId: string) {
  await updateTaskState(taskId, (state) => ({
    ...state,
    pausedBy: undefined,
    failures: 0,
    nextRunAt: undefined,
    lastRunAt: state.lastRunAt === undefined ? undefined : Date.now(),
  }));
  await armTasks();
  return true;
}

export function handleTaskMessage(
  message: unknown,
  sendResponse: (reply: unknown) => void,
) {
  if (!isTaskMessage(message)) return false;
  if (message.type === TASK_MESSAGE.seen)
    return respondWith(
      markTasksSeen().then(() => true),
      sendResponse,
    );
  if (message.type === TASK_MESSAGE.resume)
    return respondWith(resumeTask(message.taskId), sendResponse);
  // Answers whether a run starts, without waiting for it to end.
  const starts = !active.has(message.taskId);
  if (starts)
    void runTask(message.taskId, { manual: true }).catch((error: unknown) =>
      console.warn("Task run failed", error),
    );
  return respondWith(Promise.resolve(starts), sendResponse);
}

export function setupTasks() {
  const api = getBrowserApi();
  setupTaskNotificationClicks();
  api.alarms?.onAlarm.addListener((alarm) => {
    if (!alarm.name.startsWith(TASK_ALARM_PREFIX)) return;
    void runTask(alarm.name.slice(TASK_ALARM_PREFIX.length)).catch(
      (error: unknown) => console.warn("Scheduled task failed", error),
    );
  });
  const rearm = () =>
    void armTasks().catch((error: unknown) =>
      console.warn("Failed to schedule tasks", error),
    );
  storage.tasks.watch(rearm);
  storage.taskDeviceId.watch(rearm);
  storage.preferences.watch((next, previous) => {
    if (next.tasksPaused !== previous.tasksPaused) rearm();
  });
  storage.taskStates.watch((states) => void updateTaskBadge(states));
  void (async () => {
    await ensureTaskDevice();
    await recoverTasks();
    await armTasks();
    await updateTaskBadge(await storage.taskStates.get());
  })().catch((error: unknown) => console.warn("Failed to start tasks", error));
}

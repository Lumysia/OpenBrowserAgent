import { storage, removeById, updateById } from "../storage";
import { sameJson } from "../sync/codec";
import { normalizeTask } from "./normalize";
import {
  isKnownTrigger,
  type ScheduledTask,
  type TaskState,
  type TaskTrigger,
} from "./types";

// What the task form and the agent's scheduleTask tool give to create a task.
export type TaskDraft = Pick<
  ScheduledTask,
  "title" | "prompt" | "agentId" | "trigger"
> &
  Partial<Pick<ScheduledTask, "deviceId" | "enabled">>;

// A new task from a draft, run by this device unless the draft names
// another; undefined when the draft cannot be one (no usable trigger).
export async function createTask(draft: TaskDraft) {
  const now = Date.now();
  const deviceId = draft.deviceId || (await storage.taskDeviceId.get());
  const task = normalizeTask({
    ...draft,
    id: crypto.randomUUID(),
    deviceId,
    enabled: draft.enabled !== false,
    createdAt: now,
    updatedAt: now,
  });
  // Only a schedule this version can run makes a new task.
  if (!task || !isKnownTrigger(task.trigger)) return undefined;
  await storage.tasks.update((tasks) => [...tasks, task]);
  return task;
}

export type TaskPatch = Partial<
  Omit<ScheduledTask, "id" | "createdAt" | "updatedAt">
>;

// The task with `patch` applied, read as stored tasks are (same limits and
// checks as a new one); undefined when that is no task (an unusable
// trigger). `restart`: the trigger or prompt really changed, so the
// schedule counts from now and a watch takes a new baseline. Saving the
// same values again (the form saves every field) changes nothing.
export function editedTask(
  task: ScheduledTask,
  patch: TaskPatch,
  now: number,
): { task: ScheduledTask; changed: boolean; restart: boolean } | undefined {
  const next = normalizeTask({
    ...task,
    ...patch,
    id: task.id,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  });
  if (!next) return undefined;
  // A new schedule must be one this version runs.
  if (patch.trigger && !isKnownTrigger(next.trigger)) return undefined;
  const restart =
    next.prompt !== task.prompt || !sameJson(next.trigger, task.trigger);
  const changed = !sameJson(next, task);
  return {
    task: changed ? { ...next, updatedAt: now } : task,
    changed,
    restart,
  };
}

// Changes a task's definition. Returns the task as stored after it, or
// undefined when there is no such task or the change makes no valid one.
export async function updateTask(id: string, patch: TaskPatch) {
  const current = (await storage.tasks.get()).find((task) => task.id === id);
  if (!current) return undefined;
  const edit = editedTask(current, patch, Date.now());
  if (!edit) return undefined;
  if (!edit.changed) return current;
  const now = Date.now();
  const saved = await updateById(
    storage.tasks,
    id,
    (task) => editedTask(task, patch, now)?.task ?? task,
  );
  if (saved && edit.restart)
    await updateTaskState(id, (state) => ({
      ...state,
      nextRunAt: undefined,
      lastRunAt: undefined,
      baseline: undefined,
      conditionMet: undefined,
    }));
  return saved;
}

export async function deleteTask(id: string) {
  const removed = await removeById(storage.tasks, id);
  await dropTaskStates([id]);
  return removed;
}

// Forgets what this device learned of these tasks.
export function dropTaskStates(ids: string[]) {
  return storage.taskStates.update((states) =>
    ids.some((id) => id in states)
      ? Object.fromEntries(
          Object.entries(states).filter(([id]) => !ids.includes(id)),
        )
      : states,
  );
}

export function updateTaskState(
  id: string,
  change: (state: TaskState) => TaskState,
) {
  return storage.taskStates.update((states) => ({
    ...states,
    [id]: change(states[id] ?? { failures: 0 }),
  }));
}

// The task's schedule in plain English, for the agent's tools.
export function describeTrigger(trigger: TaskTrigger) {
  switch (trigger.kind) {
    case "once":
      return `once at ${new Date(trigger.at).toString()}`;
    case "interval":
      return `every ${trigger.every} ${trigger.unit}`;
    case "daily":
      return `every day at ${trigger.time} local time`;
    case "weekly":
      return `every week on days ${trigger.days.join(", ")} (0 = Sunday) at ${trigger.time} local time`;
    case "unknown":
      return `a schedule of kind "${trigger.storedKind}" from a newer version of the extension; it does not run here`;
    case "watch":
      return `watch ${trigger.url}${trigger.selector ? ` (part ${trigger.selector})` : ""} every ${trigger.everyMinutes} minutes`;
  }
}

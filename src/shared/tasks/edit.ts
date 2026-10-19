import { storage, removeById, updateById } from "../storage";
import { normalizeTask } from "./normalize";
import type { ScheduledTask, TaskState, TaskTrigger } from "./types";

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
  if (!task) return undefined;
  await storage.tasks.update((tasks) => [...tasks, task]);
  return task;
}

// Changes a task's definition. A changed trigger or prompt starts over: the
// schedule counts from now and a watch takes a new baseline.
export async function updateTask(
  id: string,
  patch: Partial<Omit<ScheduledTask, "id" | "createdAt">>,
) {
  const changed = await updateById(storage.tasks, id, (task) => ({
    ...task,
    ...patch,
    updatedAt: Date.now(),
  }));
  if (changed && ("trigger" in patch || "prompt" in patch))
    await updateTaskState(id, (state) => ({
      ...state,
      nextRunAt: undefined,
      lastRunAt: undefined,
      baseline: undefined,
    }));
  return changed;
}

export async function deleteTask(id: string) {
  const removed = await removeById(storage.tasks, id);
  await storage.taskStates.update((states) => {
    if (!(id in states)) return states;
    const next = { ...states };
    delete next[id];
    return next;
  });
  return removed;
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
    case "watch":
      return `watch ${trigger.url}${trigger.selector ? ` (part ${trigger.selector})` : ""} every ${trigger.everyMinutes} minutes`;
  }
}

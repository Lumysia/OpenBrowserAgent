import { normalizeAgents } from "../../shared/agents";
import { storage } from "../../shared/storage";
import { canonicalJson, sameJson } from "../../shared/sync/codec";
import { approvalKey, keptAgentApprovals } from "../../shared/tasks/approval";
import { idleReason, type RunContext } from "../../shared/tasks/lifecycle";
import { taskState } from "../../shared/tasks/normalize";
import type { ScheduledTask, TaskStates } from "../../shared/tasks/types";
import { notifyTask } from "./notify";

// The background's side of the user's OK (shared/tasks/approval.ts): one
// notification per version of a task that waits for it, and approvals
// that no longer apply dropped.

// A task's approval is written just before the task itself: a state that
// young is kept even while its task is not there yet.
const NEW_APPROVAL_MS = 60_000;

// The states of tasks gone (deleted here or on another device), except a
// task's approval written for it a moment before the task.
export function goneStates(
  tasks: ScheduledTask[],
  states: TaskStates,
  keep: (id: string) => boolean,
  now = Date.now(),
) {
  const ids = new Set(tasks.map((task) => task.id));
  return Object.entries(states)
    .filter(
      ([id, state]) =>
        !ids.has(id) &&
        !keep(id) &&
        !(state.approved && now - state.approved.at < NEW_APPROVAL_MS),
    )
    .map(([id]) => id);
}

// What the user is asked to allow for a task: its version, and whether
// its agent's permission is part of it.
function waitingKey(task: ScheduledTask, context: RunContext) {
  return `${approvalKey(task)}${
    context.agentsAwaitingOk?.includes(task.agentId) ? ":agent" : ""
  }`;
}

// Notifies once for each version of a task that waits for the user's OK.
export async function noticeTasksAwaitingOk(
  tasks: ScheduledTask[],
  states: TaskStates,
  context: RunContext,
) {
  const waiting = tasks.filter(
    (task) =>
      idleReason(task, taskState(states, task.id), context) === "needsOk" &&
      taskState(states, task.id).okNotified !== waitingKey(task, context),
  );
  if (!waiting.length) return;
  await storage.taskStates.update((current) => ({
    ...current,
    ...Object.fromEntries(
      waiting.map((task) => [
        task.id,
        {
          ...taskState(current, task.id),
          okNotified: waitingKey(task, context),
        },
      ]),
    ),
  }));
  for (const task of waiting)
    await notifyTask(task, "needsOk", { status: "needsUser", at: Date.now() });
}

// An agent turned off (here or by sync) needs a new OK when it is turned
// on again: its approval goes.
export async function pruneAgentApprovals() {
  const agents = normalizeAgents(await storage.agents.get());
  await storage.agentActApprovals.update((approvals) => {
    const kept = keptAgentApprovals(agents, approvals);
    return sameJson(kept, approvals) ? approvals : kept;
  });
}

// What changed the user's OKs, to schedule again when it does.
export function approvalsOf(states: TaskStates) {
  return canonicalJson(
    Object.fromEntries(
      Object.entries(states).map(([id, state]) => [id, state.approved]),
    ),
  );
}

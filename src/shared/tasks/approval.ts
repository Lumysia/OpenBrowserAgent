import { mayActUnattended } from "../agents";
import { canonicalJson, sameJson } from "../sync/codec";
import type { Agent } from "../types";
import type { ScheduledTask, TaskApproval, TaskState } from "./types";

// What the user allowed on this device, kept on this device only. A task
// runs here only as the user last allowed it: what it does (prompt), when
// (trigger), with which agent, and whether it is on. Edits in the task
// list allow themselves; a task that came by sync from another device, or
// that the agent created or changed, waits for the user's OK. Likewise an
// agent's permission to act on its own counts here only once allowed here
// for its tool groups.

// The approval of the task as it is now.
export function approvalOf(task: ScheduledTask, at: number): TaskApproval {
  return {
    prompt: task.prompt,
    trigger: task.trigger,
    agentId: task.agentId,
    enabled: task.enabled,
    at,
  };
}

// The content an approval covers, compared by value.
function covered(value: Pick<TaskApproval, "prompt" | "trigger" | "agentId">) {
  return {
    prompt: value.prompt,
    trigger: value.trigger,
    agentId: value.agentId,
  };
}

// A short form of what the user is asked to allow (to notify once per
// version).
export function approvalKey(task: ScheduledTask) {
  return canonicalJson({ ...covered(task), enabled: task.enabled });
}

// The task's definition was allowed here. Pausing needs no OK; turning a
// task on does, unless it was allowed while on.
export function taskApproved(task: ScheduledTask, state: TaskState) {
  const approved = state.approved;
  return (
    !!approved &&
    sameJson(covered(approved), covered(task)) &&
    (!task.enabled || approved.enabled)
  );
}

// Agents whose permission to act on its own the user allowed here, with
// the tool groups it was allowed for.
export type AgentActApprovals = Record<string, { toolGroups: string[] }>;

export function agentActApproval(agent: Agent) {
  return { toolGroups: [...agent.toolGroups].sort() };
}

// Whether a run of `agent` nobody watches may act on this device: the
// agent may, and the user allowed that here for its tool groups.
export function mayActHere(agent: Agent, approvals: AgentActApprovals) {
  return (
    mayActUnattended(agent) &&
    sameJson(approvals[agent.id], agentActApproval(agent))
  );
}

// Agents that would act on their own but were not allowed to here.
export function agentsAwaitingOk(
  agents: Agent[],
  approvals: AgentActApprovals,
) {
  return agents
    .filter((agent) => mayActUnattended(agent) && !mayActHere(agent, approvals))
    .map((agent) => agent.id);
}

// The approvals still worth keeping: those of agents that act. An agent
// turned off (here or by sync) needs a new OK when it is turned on again.
export function keptAgentApprovals(
  agents: Agent[],
  approvals: AgentActApprovals,
) {
  const acting = new Set(
    agents.filter(mayActUnattended).map((agent) => agent.id),
  );
  return Object.fromEntries(
    Object.entries(approvals).filter(([id]) => acting.has(id)),
  );
}

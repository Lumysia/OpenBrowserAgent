import { normalizeAgents } from "../agents";
import { storage } from "../storage";
import type { Agent, Preferences } from "../types";
import { agentsAwaitingOk, type AgentActApprovals } from "./approval";
import type { RunContext } from "./lifecycle";

// What decides on this device whether its tasks run, from what the
// scheduler, the task list and the agent's task tool each read.
export function runContextFrom({
  deviceId,
  preferences,
  agents,
  approvals,
}: {
  deviceId: string | undefined;
  preferences: Pick<Preferences, "tasksPaused"> | undefined;
  agents: Agent[] | undefined;
  approvals: AgentActApprovals | undefined;
}): RunContext {
  return {
    deviceId: deviceId || "",
    allPaused: preferences?.tasksPaused === true,
    agentsAwaitingOk: agentsAwaitingOk(
      normalizeAgents(agents),
      approvals ?? {},
    ),
  };
}

export async function loadRunContext() {
  const [deviceId, preferences, agents, approvals] = await Promise.all([
    storage.taskDeviceId.get(),
    storage.preferences.get(),
    storage.agents.get(),
    storage.agentActApprovals.get(),
  ]);
  return runContextFrom({ deviceId, preferences, agents, approvals });
}

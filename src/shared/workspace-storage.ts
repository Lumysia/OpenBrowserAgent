import { storage } from "./storage";
import type { Agent, AgentWorkspace } from "./types";
import {
  ensureAgentWorkspaces,
  type WorkspaceMutationResult,
} from "./workspace";
import { workspaceFailure } from "./workspace-errors";

// The workspace a run of `agent` uses, created if it has none; `store`:
// kept for its tools.
export async function workspaceForAgent(agent: Agent, store: boolean) {
  const workspaces = store
    ? await storeAgentWorkspaces([agent])
    : ensureAgentWorkspaces([agent], await storage.agentWorkspaces.get());
  return workspaces.find((workspace) => workspace.agentId === agent.id)!;
}

// Every one of `agents` has a stored workspace.
export function storeAgentWorkspaces(agents: Agent[]) {
  return storage.agentWorkspaces.update((current) =>
    ensureAgentWorkspaces(agents, current),
  );
}

// All file/memory tools apply an operation to the latest persisted workspace
// inside storage's shared mutation lock, including independent runs/contexts.
// `snapshot` (a run's or the editor's copy) is updated to what is stored
// afterwards, also after a conflict, so the next call sees current text.
export async function mutateWorkspace(
  snapshot: AgentWorkspace,
  mutate: (current: AgentWorkspace) => WorkspaceMutationResult,
): Promise<WorkspaceMutationResult> {
  let result: WorkspaceMutationResult = workspaceFailure("workspaceNotFound");
  let current: AgentWorkspace | undefined;
  await storage.agentWorkspaces.update((workspaces) => {
    current = workspaces.find((item) => item.agentId === snapshot.agentId);
    if (!current) return workspaces;
    result = mutate(current);
    if (!result.ok) return workspaces;
    const next = result.workspace;
    if (next === current) return workspaces;
    current = next;
    return workspaces.map((item) =>
      item.agentId === snapshot.agentId ? next : item,
    );
  });
  // Refresh even after a conflict so a subsequent read can inspect current text.
  if (current) Object.assign(snapshot, current);
  return result;
}

export function workspaceFileUnchanged(
  snapshot: AgentWorkspace,
  current: AgentWorkspace,
  path: string,
) {
  return (
    snapshot.files.find((file) => file.path === path)?.content ===
    current.files.find((file) => file.path === path)?.content
  );
}

import { storage } from "./storage";
import type { Agent, AgentWorkspace } from "./types";
import {
  deleteWorkspaceFile,
  ensureAgentWorkspaces,
  upsertWorkspaceFile,
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

// The settings editor submits only its changed paths, retaining files/memory
// saved by a running agent after the editor's draft was opened.
export function saveWorkspaceChanges(
  snapshot: AgentWorkspace,
  next: AgentWorkspace,
) {
  const paths = [
    ...new Set([...snapshot.files, ...next.files].map((file) => file.path)),
  ].filter((path) => !workspaceFileUnchanged(snapshot, next, path));
  return mutateWorkspace(snapshot, (current) => {
    if (paths.some((path) => !workspaceFileUnchanged(snapshot, current, path)))
      return workspaceFailure("conflict");
    let result: WorkspaceMutationResult = { ok: true, workspace: current };
    for (const path of paths) {
      const file = next.files.find((item) => item.path === path);
      result = file
        ? upsertWorkspaceFile(result.workspace, path, file.content)
        : deleteWorkspaceFile(result.workspace, path);
      if (!result.ok) return result;
    }
    return result;
  });
}

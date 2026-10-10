import { storage } from "./storage";
import type { AgentWorkspace } from "./types";
import {
  deleteWorkspaceFile,
  upsertWorkspaceFile,
  type WorkspaceMutationResult,
} from "./workspace";

// All file/memory tools apply an operation to the latest persisted workspace
// inside storage's shared mutation lock, including independent runs/contexts.
export async function mutateWorkspace(
  snapshot: AgentWorkspace,
  mutate: (current: AgentWorkspace) => WorkspaceMutationResult,
): Promise<WorkspaceMutationResult> {
  let result: WorkspaceMutationResult = {
    ok: false,
    error: "Workspace not found",
  };
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

export const WORKSPACE_FILE_CONFLICT =
  "Workspace file changed since it was read. Read the current file before editing it.";

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
      return { ok: false, error: WORKSPACE_FILE_CONFLICT };
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

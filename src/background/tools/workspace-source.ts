import type { AgentWorkspace, WorkspaceFile } from "../../shared/types";
import { normalizeWorkspacePath } from "../../shared/workspace";

// How tools name an agent workspace file: "workspace:PATH".
export const WORKSPACE_SOURCE_PREFIX = "workspace:";

export function workspaceSource(path: string) {
  return `${WORKSPACE_SOURCE_PREFIX}${path}`;
}

// The path in "workspace:PATH" (or a bare path).
export function workspaceSourcePath(value: string) {
  return value.startsWith(WORKSPACE_SOURCE_PREFIX)
    ? value.slice(WORKSPACE_SOURCE_PREFIX.length)
    : value;
}

// The workspace file a tool argument names, or the error that lists the
// files there are.
export function findWorkspaceFile(
  workspace: AgentWorkspace,
  value: string,
): { ok: true; file: WorkspaceFile } | { ok: false; error: string } {
  const normalized = normalizeWorkspacePath(workspaceSourcePath(value));
  const file = normalized.ok
    ? workspace.files.find((entry) => entry.path === normalized.path)
    : undefined;
  if (file) return { ok: true, file };
  const files = workspace.files.map((entry) => entry.path).join(", ");
  return {
    ok: false,
    error: `No workspace file "${workspaceSourcePath(value)}". Files: ${files || "none"}.`,
  };
}

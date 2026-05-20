import { storage } from "../shared/storage";
import type { AgentWorkspace } from "../shared/types";
import {
  deleteWorkspaceFile as deleteWorkspaceFileHelper,
  patchWorkspaceFile as patchWorkspaceFileHelper,
  searchWorkspaceFiles as searchWorkspaceFilesHelper,
  upsertWorkspaceFile,
  type WorkspacePatchOperation,
} from "../shared/workspace";

export function listWorkspaceFiles(workspace: AgentWorkspace | undefined) {
  if (!workspace) return { error: "No current agent workspace" };
  return {
    agentId: workspace.agentId,
    files: workspace.files.map((file) => ({
      path: file.path,
      kind: file.kind,
      chars: file.content.length,
      updatedAt: file.updatedAt,
    })),
  };
}

export function readWorkspaceFile(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  if (!workspace) return { error: "No current agent workspace" };
  const path = String(input.path || "").trim();
  const file = workspace.files.find((item) => item.path === path);
  if (!file) return { error: "Workspace file not found", path };
  return { path: file.path, kind: file.kind, content: file.content };
}

export async function writeWorkspaceFile(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  if (!workspace) return { error: "No current agent workspace" };
  const path = String(input.path || "").trim();
  const content = String(input.content ?? "");
  const result = upsertWorkspaceFile(workspace, path, content);
  if (!result.ok) return { error: result.error, path };
  await persistWorkspace(result.workspace);
  Object.assign(workspace, result.workspace);
  return {
    path: result.file?.path,
    kind: result.file?.kind,
    chars: result.file?.content.length,
    updated: true,
  };
}

export async function patchWorkspaceFile(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  if (!workspace) return { error: "No current agent workspace" };
  const path = String(input.path || "").trim();
  const operation = String(
    input.operation || "replace",
  ) as WorkspacePatchOperation;
  if (!["replace", "append", "prepend"].includes(operation))
    return { error: "Invalid workspace patch operation", operation };
  const result = patchWorkspaceFileHelper(
    workspace,
    path,
    operation,
    String(input.value ?? ""),
    String(input.find || ""),
  );
  if (!result.ok) return { error: result.error, path };
  await persistWorkspace(result.workspace);
  Object.assign(workspace, result.workspace);
  return {
    path: result.file?.path,
    chars: result.file?.content.length,
    patched: true,
  };
}

export async function deleteWorkspaceFile(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  if (!workspace) return { error: "No current agent workspace" };
  const path = String(input.path || "").trim();
  const result = deleteWorkspaceFileHelper(workspace, path);
  if (!result.ok) return { error: result.error, path };
  await persistWorkspace(result.workspace);
  Object.assign(workspace, result.workspace);
  return { path, deleted: true };
}

export function searchWorkspaceFiles(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  if (!workspace) return { error: "No current agent workspace" };
  const query = String(input.query || "").trim();
  return { query, results: searchWorkspaceFilesHelper(workspace, query) };
}

async function persistWorkspace(workspace: AgentWorkspace) {
  const allWorkspaces = await storage.agentWorkspaces.get();
  const others = allWorkspaces.filter(
    (item) => item.agentId !== workspace.agentId,
  );
  await storage.agentWorkspaces.set([...others, workspace]);
}

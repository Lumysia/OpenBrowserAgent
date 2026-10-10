import {
  mutateWorkspace,
  workspaceFileUnchanged,
  WORKSPACE_FILE_CONFLICT,
} from "../shared/workspace-storage";
import type { AgentWorkspace } from "../shared/types";
import {
  deleteWorkspaceFile as deleteWorkspaceFileHelper,
  isWorkspaceAgentWritableFile,
  patchWorkspaceFile as patchWorkspaceFileHelper,
  searchWorkspaceFiles as searchWorkspaceFilesHelper,
  upsertWorkspaceFile,
  type WorkspacePatchOperation,
} from "../shared/workspace";
import { withContentSlice, withListSlice } from "./tool-utils";

export function workspaceFiles(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  const operation = String(input.operation || "list");
  if (operation === "list") return listWorkspaceFiles(workspace, input);
  if (operation === "read") return readWorkspaceFile(workspace, input);
  if (operation === "write") return writeWorkspaceFile(workspace, input);
  if (operation === "patch") return patchWorkspaceFile(workspace, input);
  if (operation === "delete") return deleteWorkspaceFile(workspace, input);
  if (operation === "search") return searchWorkspaceFiles(workspace, input);
  return { error: "Unknown workspace file operation", operation };
}

export function listWorkspaceFiles(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown> = {},
) {
  if (!workspace) return { error: "No current agent workspace" };
  return withListSlice(
    { agentId: workspace.agentId },
    workspace.files.map((file) => ({
      path: file.path,
      kind: file.kind,
      chars: file.content.length,
      updatedAt: file.updatedAt,
    })),
    input,
    "files",
  );
}

export function readWorkspaceFile(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  if (!workspace) return { error: "No current agent workspace" };
  const path = String(input.path || "").trim();
  const file = workspace.files.find((item) => item.path === path);
  if (!file) return { error: "Workspace file not found", path };
  return withContentSlice(
    { path: file.path, kind: file.kind },
    file.content,
    input,
  );
}

export async function writeWorkspaceFile(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  if (!workspace) return { error: "No current agent workspace" };
  const path = String(input.path || "").trim();
  const content = String(input.content ?? "");
  if (!isWorkspaceAgentWritableFile(path))
    return {
      error:
        "This workspace file is managed by product rules or memory tools and cannot be changed with generic workspace file tools.",
      path,
    };
  const result = await mutateWorkspace(workspace, (current) =>
    workspaceFileUnchanged(workspace, current, path)
      ? upsertWorkspaceFile(current, path, content)
      : { ok: false, error: WORKSPACE_FILE_CONFLICT },
  );
  if (!result.ok) return { error: result.error, path };
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
    input.patchOperation || "replace",
  ) as WorkspacePatchOperation;
  if (!isWorkspaceAgentWritableFile(path))
    return {
      error:
        "This workspace file is managed by product rules or memory tools and cannot be changed with generic workspace file tools.",
      path,
    };
  if (!["replace", "append", "prepend"].includes(operation))
    return { error: "Invalid workspace patch operation", operation };
  const result = await mutateWorkspace(workspace, (current) =>
    operation === "replace" && !workspaceFileUnchanged(workspace, current, path)
      ? { ok: false, error: WORKSPACE_FILE_CONFLICT }
      : patchWorkspaceFileHelper(
          current,
          path,
          operation,
          String(input.value ?? ""),
          String(input.find || ""),
        ),
  );
  if (!result.ok) return { error: result.error, path };
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
  if (!isWorkspaceAgentWritableFile(path))
    return {
      error:
        "This workspace file is managed by product rules or memory tools and cannot be deleted with generic workspace file tools.",
      path,
    };
  const result = await mutateWorkspace(workspace, (current) =>
    workspaceFileUnchanged(workspace, current, path)
      ? deleteWorkspaceFileHelper(current, path)
      : { ok: false, error: WORKSPACE_FILE_CONFLICT },
  );
  if (!result.ok) return { error: result.error, path };
  return { path, deleted: true };
}

export function searchWorkspaceFiles(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  if (!workspace) return { error: "No current agent workspace" };
  const query = String(input.query || "").trim();
  const result = searchWorkspaceFilesHelper(workspace, query);
  const paged = withListSlice({ query }, result.results, input, "results");
  return {
    ...paged,
    truncated: paged.truncated || result.truncated,
    searchTruncated: result.truncated,
    resultCharLimit: result.resultCharLimit,
    previewCharLimit: result.previewCharLimit,
  };
}

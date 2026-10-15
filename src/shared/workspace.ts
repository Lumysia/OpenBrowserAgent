import {
  WORKSPACE_FILE_MAX_CHARS,
  WORKSPACE_PATH_MAX_LENGTH,
  WORKSPACE_SEARCH_PREVIEW_MAX_CHARS,
  WORKSPACE_SEARCH_RESULT_MAX_CHARS,
  WORKSPACE_TOTAL_MAX_CHARS,
} from "./config";
import { readPath } from "./read-ids";
import { workspaceFailure, type WorkspaceFailure } from "./workspace-errors";
import type {
  Agent,
  AgentWorkspace,
  WorkspaceFile,
  WorkspaceFileKind,
} from "./types";

// MEMORY.md and USER.md are shown to the agent in its system prompt.
export const WORKSPACE_FILE_PATH = {
  memory: "MEMORY.md",
  user: "USER.md",
  notes: "NOTES.md",
} as const;

const PROMPT_FILES = new Set<string>([
  WORKSPACE_FILE_PATH.memory,
  WORKSPACE_FILE_PATH.user,
]);

// The files shown in the system prompt (small, synced with the settings).
export const isPromptFile = (path: string) => PROMPT_FILES.has(path);

const DEFAULT_WORKSPACE_FILE_CONTENT: Record<string, string> = {
  [WORKSPACE_FILE_PATH.memory]: "# Memory\n\n",
  [WORKSPACE_FILE_PATH.user]: "# User\n\n",
  [WORKSPACE_FILE_PATH.notes]: "# Notes\n\n",
};

type WorkspacePatchOperation = "replace" | "append" | "prepend";

export type WorkspaceMutationResult =
  | { ok: true; workspace: AgentWorkspace; file?: WorkspaceFile }
  | WorkspaceFailure;

export function createWorkspace(
  agentId: string,
  now = Date.now(),
): AgentWorkspace {
  return {
    agentId,
    files: createDefaultWorkspaceFiles(),
    createdAt: now,
    updatedAt: now,
  };
}

// The workspaces with one for each agent that has none. Default files come
// only with a new workspace: the user may delete them from an existing one.
export function ensureAgentWorkspaces(
  agents: Agent[],
  workspaces: AgentWorkspace[],
) {
  const missing = agents.filter(
    (agent) => !workspaces.some((workspace) => workspace.agentId === agent.id),
  );
  return missing.length
    ? [...workspaces, ...missing.map((agent) => createWorkspace(agent.id))]
    : workspaces;
}

export function normalizeWorkspaces(value: AgentWorkspace[] | undefined) {
  if (!Array.isArray(value)) return [];
  // A missing time reads as 0 (unknown): reading never invents one.
  const now = 0;
  const byAgent = new Map<string, AgentWorkspace>();
  for (const item of value) {
    if (!item?.agentId) continue;
    const existing = byAgent.get(item.agentId);
    const workspace = normalizeWorkspace(item, now);
    byAgent.set(
      item.agentId,
      existing
        ? {
            ...workspace,
            files: normalizeWorkspaceFiles([
              ...existing.files,
              ...workspace.files,
            ]),
            createdAt: Math.min(existing.createdAt, workspace.createdAt),
            updatedAt: Math.max(existing.updatedAt, workspace.updatedAt),
          }
        : workspace,
    );
  }
  return [...byAgent.values()];
}

function normalizeWorkspace(
  workspace: AgentWorkspace | undefined,
  now = Date.now(),
): AgentWorkspace {
  if (!workspace?.agentId) return createWorkspace("", now);
  const files = normalizeWorkspaceFiles(workspace.files || []);
  return {
    agentId: workspace.agentId,
    files,
    createdAt: workspace.createdAt || now,
    updatedAt:
      workspace.updatedAt ||
      files.reduce(
        (latest, file) => Math.max(latest, file.updatedAt || 0),
        0,
      ) ||
      now,
  };
}

// Never edited (time 0): a workspace merge without a base tells them from a
// file the user set back to its default text.
function createDefaultWorkspaceFiles() {
  return Object.entries(DEFAULT_WORKSPACE_FILE_CONTENT).map(
    ([path, content]) => ({
      path,
      content,
      kind: workspaceFileKind(path),
      updatedAt: 0,
    }),
  );
}

export function normalizeWorkspaceFiles(files: WorkspaceFile[]) {
  const byPath = new Map<string, WorkspaceFile>();
  for (const file of files) {
    const pathResult = normalizeWorkspacePath(file.path);
    if (!pathResult.ok) continue;
    const content = String(file.content || "");
    byPath.set(pathResult.path, {
      path: pathResult.path,
      content: content.slice(0, WORKSPACE_FILE_MAX_CHARS),
      kind: workspaceFileKind(pathResult.path),
      updatedAt: Number.isFinite(file.updatedAt) ? file.updatedAt : Date.now(),
    });
  }
  return [...byPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

export function normalizeWorkspacePath(
  value: unknown,
): { ok: true; path: string } | WorkspaceFailure {
  const path = readPath(value);
  if (!path) return workspaceFailure("pathRequired");
  if (path.length > WORKSPACE_PATH_MAX_LENGTH)
    return workspaceFailure("pathTooLong");
  if (path.split("/").some((part) => part === "." || part === ".."))
    return workspaceFailure("relativePath");
  return { ok: true, path };
}

export function workspaceFileKind(path: string): WorkspaceFileKind {
  return path.toLowerCase().endsWith(".md") ? "markdown" : "text";
}

export function workspaceTotalChars(files: WorkspaceFile[]) {
  return files.reduce((total, file) => total + file.content.length, 0);
}

export function upsertWorkspaceFile(
  workspace: AgentWorkspace,
  path: string,
  content: string,
  now = Date.now(),
): WorkspaceMutationResult {
  const pathResult = normalizeWorkspacePath(path);
  if (!pathResult.ok) return pathResult;
  if (content.length > WORKSPACE_FILE_MAX_CHARS)
    return workspaceFailure("fileTooLarge");
  const existing = workspace.files.filter(
    (file) => file.path !== pathResult.path,
  );
  const file = {
    path: pathResult.path,
    content,
    kind: workspaceFileKind(pathResult.path),
    updatedAt: now,
  } satisfies WorkspaceFile;
  if (workspaceTotalChars([...existing, file]) > WORKSPACE_TOTAL_MAX_CHARS)
    return workspaceFailure("workspaceTooLarge");
  return {
    ok: true,
    workspace: {
      ...workspace,
      files: normalizeWorkspaceFiles([...existing, file]),
      updatedAt: now,
    },
    file,
  };
}

export function patchWorkspaceFile(
  workspace: AgentWorkspace,
  path: string,
  operation: WorkspacePatchOperation,
  value: string,
  find = "",
  now = Date.now(),
) {
  const pathResult = normalizeWorkspacePath(path);
  if (!pathResult.ok) return pathResult;
  const file = workspace.files.find((item) => item.path === pathResult.path);
  if (!file) return workspaceFailure("fileNotFound");
  if (operation === "replace" && find && !file.content.includes(find))
    return workspaceFailure("findNotFound");
  const nextContent =
    operation === "append"
      ? `${file.content}${value}`
      : operation === "prepend"
        ? `${value}${file.content}`
        : find
          ? file.content.replace(find, () => value)
          : value;
  return upsertWorkspaceFile(workspace, pathResult.path, nextContent, now);
}

export function deleteWorkspaceFile(
  workspace: AgentWorkspace,
  path: string,
  now = Date.now(),
): WorkspaceMutationResult {
  const pathResult = normalizeWorkspacePath(path);
  if (!pathResult.ok) return pathResult;
  const files = workspace.files.filter((file) => file.path !== pathResult.path);
  if (files.length === workspace.files.length)
    return workspaceFailure("fileNotFound");
  return { ok: true, workspace: { ...workspace, files, updatedAt: now } };
}

export function searchWorkspaceFiles(workspace: AgentWorkspace, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle)
    return {
      results: [],
      truncated: false,
      resultCharLimit: WORKSPACE_SEARCH_RESULT_MAX_CHARS,
      previewCharLimit: WORKSPACE_SEARCH_PREVIEW_MAX_CHARS,
    };
  const results: Array<{ path: string; line: number; preview: string }> = [];
  let usedChars = 0;
  for (const file of workspace.files) {
    const lines = file.content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (!line.toLowerCase().includes(needle)) continue;
      const preview = line.trim().slice(0, WORKSPACE_SEARCH_PREVIEW_MAX_CHARS);
      usedChars += preview.length;
      if (usedChars > WORKSPACE_SEARCH_RESULT_MAX_CHARS)
        return {
          results,
          truncated: true,
          resultCharLimit: WORKSPACE_SEARCH_RESULT_MAX_CHARS,
          previewCharLimit: WORKSPACE_SEARCH_PREVIEW_MAX_CHARS,
        };
      results.push({ path: file.path, line: index + 1, preview });
    }
  }
  return {
    results,
    truncated: false,
    resultCharLimit: WORKSPACE_SEARCH_RESULT_MAX_CHARS,
    previewCharLimit: WORKSPACE_SEARCH_PREVIEW_MAX_CHARS,
  };
}

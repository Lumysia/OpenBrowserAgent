import JSZip from "jszip";
import type { AgentWorkspace, WorkspaceFile } from "../../src/shared/types";
import {
  isWorkspaceUserEditableFile,
  normalizeWorkspaceFiles,
  normalizeWorkspacePath,
  workspaceFileKind,
  workspaceTotalChars,
} from "../../src/shared/workspace";
import { WORKSPACE_TOTAL_MAX_CHARS } from "../../src/shared/config";

const TEXT_FILE_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".tsv",
  ".js",
  ".ts",
  ".css",
  ".html",
  ".xml",
]);

export async function importWorkspaceZip(
  file: File,
  workspace: AgentWorkspace,
): Promise<AgentWorkspace> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter(
    (entry) =>
      !entry.dir && !isHiddenPath(entry.name) && isTextPath(entry.name),
  );
  const root = commonRoot(entries.map((entry) => normalizePath(entry.name)));
  const files = await Promise.all(
    entries.map(async (entry) => readWorkspaceZipFile(entry, root)),
  );
  const nextFiles = normalizeWorkspaceFiles([
    ...workspace.files,
    ...files.filter((item) => isWorkspaceUserEditableFile(item.path)),
  ]);
  if (workspaceTotalChars(nextFiles) > WORKSPACE_TOTAL_MAX_CHARS)
    throw new Error(
      `Workspace content must be ${WORKSPACE_TOTAL_MAX_CHARS} characters or less`,
    );
  return { ...workspace, files: nextFiles, updatedAt: Date.now() };
}

export async function downloadWorkspaceZip(workspace: AgentWorkspace) {
  const zip = new JSZip();
  const root = `workspace-${workspace.agentId || "agent"}`;
  for (const file of normalizeWorkspaceFiles(workspace.files))
    zip.file(`${root}/${file.path}`, file.content);
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${root}.zip`);
}

async function readWorkspaceZipFile(
  entry: JSZip.JSZipObject,
  root: string,
): Promise<WorkspaceFile> {
  const path = stripRoot(normalizePath(entry.name), root);
  const pathResult = normalizeWorkspacePath(path);
  if (!pathResult.ok) throw new Error(pathResult.error);
  return {
    path: pathResult.path,
    kind: workspaceFileKind(pathResult.path),
    content: await entry.async("string"),
    updatedAt: Date.now(),
  };
}

function commonRoot(paths: string[]) {
  const roots = new Set(paths.map((path) => path.split("/")[0] || ""));
  return roots.size === 1 ? [...roots][0] : "";
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function stripRoot(path: string, root: string) {
  return root && path.startsWith(`${root}/`)
    ? path.slice(root.length + 1)
    : path;
}

function isHiddenPath(path: string) {
  return normalizePath(path)
    .split("/")
    .some((segment) => segment.startsWith(".") || segment === "__MACOSX");
}

function isTextPath(path: string) {
  const extension = path.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  return !extension || TEXT_FILE_EXTENSIONS.has(extension);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

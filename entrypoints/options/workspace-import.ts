import JSZip from "jszip";
import { AGENT_CAPABILITY_KEYS } from "../../src/shared/agents";
import type {
  Agent,
  AgentWorkspace,
  WorkspaceFile,
} from "../../src/shared/types";
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

const AGENT_MANIFEST_PATH = "agent.json";
const AGENT_WORKSPACE_ROOT = "workspace";

type AgentZipImport = {
  agent: Agent;
  workspace: AgentWorkspace;
};

type AgentZipManifest = Pick<
  Agent,
  "name" | "description" | "icon" | "capabilities"
>;

export async function importAgentZip(file: File): Promise<AgentZipImport> {
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file(AGENT_MANIFEST_PATH);
  if (!manifestEntry) throw new Error("Agent package is missing agent.json");
  const manifest = JSON.parse(
    await manifestEntry.async("string"),
  ) as Partial<AgentZipManifest>;
  if (!manifest.name || !isAgentCapabilities(manifest.capabilities))
    throw new Error("Agent package has an invalid agent.json");
  const now = Date.now();
  const agentId = crypto.randomUUID();
  const entries = Object.values(zip.files).filter(
    (entry) =>
      !entry.dir &&
      !isHiddenPath(entry.name) &&
      normalizePath(entry.name).startsWith(`${AGENT_WORKSPACE_ROOT}/`) &&
      isTextPath(entry.name),
  );
  const files = await Promise.all(
    entries.map((entry) => readWorkspaceZipFile(entry, AGENT_WORKSPACE_ROOT)),
  );
  const nextFiles = normalizeWorkspaceFiles(
    files.filter((item) => isWorkspaceUserEditableFile(item.path)),
  );
  if (workspaceTotalChars(nextFiles) > WORKSPACE_TOTAL_MAX_CHARS)
    throw new Error(
      `Workspace content must be ${WORKSPACE_TOTAL_MAX_CHARS} characters or less`,
    );
  return {
    agent: {
      id: agentId,
      name: manifest.name,
      description: manifest.description || "",
      icon: manifest.icon,
      capabilities: manifest.capabilities,
      createdAt: now,
      updatedAt: now,
    },
    workspace: {
      agentId,
      files: nextFiles,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export async function downloadAgentZip(
  agent: Agent,
  workspace: AgentWorkspace,
) {
  const zip = new JSZip();
  const manifest: AgentZipManifest = {
    name: agent.name,
    description: agent.description,
    icon: agent.icon,
    capabilities: agent.capabilities,
  };
  zip.file(AGENT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of normalizeWorkspaceFiles(workspace.files))
    zip.file(`${AGENT_WORKSPACE_ROOT}/${file.path}`, file.content);
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `agent-${safeZipName(agent.name || agent.id)}.zip`);
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

function safeZipName(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "agent"
  );
}

function isAgentCapabilities(value: unknown): value is Agent["capabilities"] {
  if (!value || typeof value !== "object") return false;
  return AGENT_CAPABILITY_KEYS.every(
    (key) => typeof (value as Record<string, unknown>)[key] === "boolean",
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

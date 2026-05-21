import { storage } from "../shared/storage";
import { MEMORY_ENTRY_TEXT_MAX_CHARS } from "../shared/config";
import type { AgentWorkspace, WorkspaceFile } from "../shared/types";
import { upsertWorkspaceFile, WORKSPACE_FILE_PATH } from "../shared/workspace";
import { withListSlice } from "./tool-utils";

type MemoryKind = "memory" | "user";

type MemoryEntry = {
  id: string;
  text: string;
};

const MEMORY_HEADER = {
  memory: "# Memory",
  user: "# User",
} as const;

const MEMORY_PATH = {
  memory: WORKSPACE_FILE_PATH.memory,
  user: WORKSPACE_FILE_PATH.user,
} as const;

export function listMemory(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown> = {},
) {
  return listEntries(workspace, "memory", input);
}

export function listUserProfile(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown> = {},
) {
  return listEntries(workspace, "user", input);
}

export async function addMemory(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  return addEntry(workspace, "memory", input);
}

export async function addUserProfileNote(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  return addEntry(workspace, "user", input);
}

export async function updateMemory(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  return updateEntry(workspace, "memory", input);
}

export async function updateUserProfileNote(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  return updateEntry(workspace, "user", input);
}

export async function removeMemory(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  return removeEntry(workspace, "memory", input);
}

export async function removeUserProfileNote(
  workspace: AgentWorkspace | undefined,
  input: Record<string, unknown>,
) {
  return removeEntry(workspace, "user", input);
}

function listEntries(
  workspace: AgentWorkspace | undefined,
  kind: MemoryKind,
  input: Record<string, unknown>,
) {
  if (!workspace) return { error: "No current agent workspace" };
  return withListSlice(
    { path: MEMORY_PATH[kind] },
    readEntries(workspace, kind),
    input,
    "entries",
  );
}

async function addEntry(
  workspace: AgentWorkspace | undefined,
  kind: MemoryKind,
  input: Record<string, unknown>,
) {
  if (!workspace) return { error: "No current agent workspace" };
  const text = normalizeEntryText(input.text || input.note || input.content);
  if (!text) return { error: "Missing memory text" };
  const entries = readEntries(workspace, kind);
  const entry = { id: createEntryId(kind), text };
  return persistEntries(workspace, kind, [...entries, entry], entry, "added");
}

async function updateEntry(
  workspace: AgentWorkspace | undefined,
  kind: MemoryKind,
  input: Record<string, unknown>,
) {
  if (!workspace) return { error: "No current agent workspace" };
  const id = String(input.id || "").trim();
  const text = normalizeEntryText(input.text || input.note || input.content);
  if (!id || !text) return { error: "Missing memory id or text", id };
  const entries = readEntries(workspace, kind);
  const index = entries.findIndex((entry) => entry.id === id);
  if (index < 0) return { error: "Memory entry not found", id };
  const entry = { id, text };
  const nextEntries = [...entries];
  nextEntries[index] = entry;
  return persistEntries(workspace, kind, nextEntries, entry, "updated");
}

async function removeEntry(
  workspace: AgentWorkspace | undefined,
  kind: MemoryKind,
  input: Record<string, unknown>,
) {
  if (!workspace) return { error: "No current agent workspace" };
  const id = String(input.id || "").trim();
  if (!id) return { error: "Missing memory id" };
  const entries = readEntries(workspace, kind);
  const entry = entries.find((item) => item.id === id);
  if (!entry) return { error: "Memory entry not found", id };
  const nextEntries = entries.filter((item) => item.id !== id);
  return persistEntries(workspace, kind, nextEntries, entry, "removed");
}

async function persistEntries(
  workspace: AgentWorkspace,
  kind: MemoryKind,
  entries: MemoryEntry[],
  entry: MemoryEntry,
  action: "added" | "updated" | "removed",
) {
  const content = renderEntries(kind, entries);
  const result = upsertWorkspaceFile(workspace, MEMORY_PATH[kind], content);
  if (!result.ok) return { error: result.error };
  await persistWorkspace(result.workspace);
  Object.assign(workspace, result.workspace);
  return {
    path: MEMORY_PATH[kind],
    entry,
    [action]: true,
    note: "This updates stored memory for future runs; the current prompt snapshot is unchanged.",
  };
}

function readEntries(workspace: AgentWorkspace, kind: MemoryKind) {
  const file = workspace.files.find((item) => item.path === MEMORY_PATH[kind]);
  return parseEntries(file).map((entry, index) => ({
    id: entry.id || `legacy-${index + 1}`,
    text: entry.text,
  }));
}

function parseEntries(file: WorkspaceFile | undefined): MemoryEntry[] {
  if (!file?.content) return [];
  return file.content
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+(?:\[([^\]]+)\]\s*)?(.+)$/))
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => ({ id: match[1] || "", text: match[2].trim() }))
    .filter((entry) => entry.text);
}

function renderEntries(kind: MemoryKind, entries: MemoryEntry[]) {
  const body = entries
    .map((entry) => `- [${entry.id}] ${entry.text.replace(/\r?\n/g, " ")}`)
    .join("\n");
  return `${MEMORY_HEADER[kind]}\n\n${body}${body ? "\n" : ""}`;
}

function normalizeEntryText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MEMORY_ENTRY_TEXT_MAX_CHARS);
}

function createEntryId(kind: MemoryKind) {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function persistWorkspace(workspace: AgentWorkspace) {
  const allWorkspaces = await storage.agentWorkspaces.get();
  const others = allWorkspaces.filter(
    (item) => item.agentId !== workspace.agentId,
  );
  await storage.agentWorkspaces.set([...others, workspace]);
}

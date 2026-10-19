import { DEFAULT_PREFERENCES } from "../default-preferences";
import {
  DEFAULT_SYNC_GROUP_SETTINGS,
  STORAGE_KEYS,
  SYNC_GROUPS,
  type SyncGroupSettings,
} from "../storage-keys";
import type { SyncCapabilities } from "../sync-backends";
import { createWorkspace, isPromptFile } from "../workspace";
import type { Collection } from "./collection";
import { attachmentsCollection, chatsCollection } from "./collections-chats";
import {
  fieldsPart,
  filesPart,
  list,
  recordMap,
  storedCollection,
} from "./stored-collections";

const LANGUAGE_ID = "value";

// Collections the settings pages ask about (files that may not sync here).
export const SKILL_FILES = "skill-files";
export const WORKSPACE_FILES = "workspace-files";

// Fields synced only in the keys group, encrypted.
const PROVIDER_KEY_FIELDS = ["apiKey"];
const MCP_KEY_FIELDS = ["headers"];

const keys = {
  groups: [SYNC_GROUPS.keys],
  encrypted: true,
} as const;
const files = {
  groups: [SYNC_GROUPS.files],
  largeContent: true,
  body: "json",
} as const;

// Everything that syncs. Collections on the same storage key sync parts of
// its items: settings always, keys and files in their groups.
export const SYNC_COLLECTIONS: Collection[] = [
  storedCollection({
    name: "language",
    key: STORAGE_KEYS.language,
    toEntries: (value) =>
      new Map(
        typeof value === "string" ? [[LANGUAGE_ID, { data: value }]] : [],
      ),
    fromEntries: (entries, previous) =>
      entries.get(LANGUAGE_ID)?.data ?? previous,
  }),
  // Preferences and sync settings: one record per field.
  recordMap({
    name: "preferences",
    key: STORAGE_KEYS.preferences,
    defaults: DEFAULT_PREFERENCES,
  }),
  recordMap({
    name: "sync-groups",
    key: STORAGE_KEYS.syncGroups,
    defaults: DEFAULT_SYNC_GROUP_SETTINGS,
  }),
  recordMap({
    name: "providers",
    key: STORAGE_KEYS.provider,
    part: fieldsPart(PROVIDER_KEY_FIELDS, true),
  }),
  recordMap({
    name: "provider-keys",
    partOf: "providers",
    key: STORAGE_KEYS.provider,
    part: fieldsPart(PROVIDER_KEY_FIELDS, false),
    ...keys,
  }),
  list({ name: "agents", key: STORAGE_KEYS.agents }),
  // Workspaces: MEMORY.md and USER.md with the settings (they are small and
  // part of the agent's prompt), the other files in the files group.
  list({
    name: "workspaces",
    key: STORAGE_KEYS.agentWorkspaces,
    idField: "agentId",
    part: filesPart("files", isPromptFile, true),
    body: "json",
    newBody: () =>
      createWorkspace("").files.filter((file) => isPromptFile(file.path)),
    ordered: false,
  }),
  list({
    name: WORKSPACE_FILES,
    partOf: "workspaces",
    key: STORAGE_KEYS.agentWorkspaces,
    idField: "agentId",
    part: filesPart("files", (path) => !isPromptFile(path), false),
    newBody: () =>
      createWorkspace("").files.filter((file) => !isPromptFile(file.path)),
    ...files,
  }),
  list({
    name: "skills",
    key: STORAGE_KEYS.skills,
    part: fieldsPart(["files"], true),
  }),
  list({
    name: SKILL_FILES,
    partOf: "skills",
    key: STORAGE_KEYS.skills,
    part: filesPart("files", () => true, false),
    ...files,
  }),
  recordMap({ name: "skill-settings", key: STORAGE_KEYS.skillSettings }),
  list({
    name: "mcp-servers",
    key: STORAGE_KEYS.mcpServers,
    part: fieldsPart(MCP_KEY_FIELDS, true),
  }),
  list({
    name: "mcp-headers",
    partOf: "mcp-servers",
    key: STORAGE_KEYS.mcpServers,
    part: fieldsPart(MCP_KEY_FIELDS, false),
    ...keys,
  }),
  // Task definitions; what a task learned on a device (task-states) stays
  // there, and each task runs only on its device (deviceId).
  list({ name: "tasks", key: STORAGE_KEYS.tasks }),
  list({ name: "task-devices", key: STORAGE_KEYS.taskDevices }),
  chatsCollection,
  attachmentsCollection,
];

// The collections a backend syncs: their groups on, and room for them.
export function enabledCollections(
  settings: SyncGroupSettings,
  capabilities: SyncCapabilities,
): Collection[] {
  return SYNC_COLLECTIONS.filter(
    (collection) =>
      (!collection.largeContent || capabilities.largeContent) &&
      collection.groups.every((group) => settings[group]),
  );
}

export function syncCollection(name: string) {
  return SYNC_COLLECTIONS.find((collection) => collection.name === name);
}

export function recordIdOf(collection: Collection, id: string) {
  return `${collection.name}/${id}`;
}

export function splitRecordId(recordId: string) {
  const slash = recordId.indexOf("/");
  return {
    collection: recordId.slice(0, slash),
    id: recordId.slice(slash + 1),
  };
}

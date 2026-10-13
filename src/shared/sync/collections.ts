import { storageLockName } from "../locks";
import { DEFAULT_PREFERENCES } from "../default-preferences";
import {
  DEFAULT_SYNC_DATA_SETTINGS,
  STORAGE_KEYS,
  SYNC_PREFERENCES,
} from "../storage-keys";
import {
  applyVerified,
  listEntries,
  orderItems,
  ORDER_ID,
  writeHooks,
  type Change,
  type Collection,
  type CollectionGate,
  type LocalEntry,
} from "./collection";
import { readKey, type SyncEnv } from "./env";
import { mergeFiles } from "./merge-content";
import { createWorkspace } from "../workspace";
import { attachmentsCollection, chatsCollection } from "./collections-chats";

type Item = Record<string, unknown>;

// One stored value holding the whole collection.
function storedCollection({
  name,
  gate,
  key,
  browserSync = true,
  body,
  toEntries,
  fromEntries,
  ordered,
  mergeBodies,
  defaults,
  secrets,
}: {
  name: string;
  gate: CollectionGate;
  key: string;
  browserSync?: boolean;
  body?: "json";
  toEntries(value: unknown): Map<string, LocalEntry>;
  fromEntries(entries: Map<string, LocalEntry>, previous: unknown): unknown;
  ordered?: boolean;
  mergeBodies?: Collection["mergeBodies"];
  // Values the app uses while a field was never stored.
  defaults?: Record<string, unknown>;
  secrets?: string[];
}): Collection {
  return {
    name,
    gate,
    browserSync,
    keys: [key],
    body,
    ordered,
    mergeBodies,
    secrets,
    defaultData: defaults && ((id) => defaults[id]),
    async read(env) {
      return toEntries(await readKey(env.local, key));
    },
    entriesOf: (_key, value) => ({ entries: toEntries(value), complete: true }),
    write(env: SyncEnv, changes: Change[], hooks) {
      const { verify, commit, step } = writeHooks(env, hooks);
      return env.lock(storageLockName(key), () =>
        step(async () => {
          const previous = await readKey(env.local, key);
          const entries = toEntries(previous);
          const written = await applyVerified(entries, changes, verify);
          if (written.size)
            await commit({ [key]: fromEntries(entries, previous) }, written);
          return written;
        }),
      );
    },
  };
}

const isRecord = (value: unknown): value is Item =>
  !!value && typeof value === "object" && !Array.isArray(value);

const recordMap = (
  name: string,
  gate: CollectionGate,
  key: string,
  options: { defaults?: object; secrets?: string[] } = {},
): Collection =>
  storedCollection({
    name,
    gate,
    key,
    defaults: options.defaults as Record<string, unknown> | undefined,
    secrets: options.secrets,
    toEntries: (value) =>
      new Map(
        Object.entries(isRecord(value) ? value : {})
          .filter(([, entry]) => entry !== undefined)
          .map(([id, data]) => [id, { data }]),
      ),
    fromEntries: (entries) =>
      Object.fromEntries([...entries].map(([id, entry]) => [id, entry.data])),
  });

const createdAt = (item: Item) =>
  typeof item.createdAt === "number" ? item.createdAt : 0;

// A list of items keyed by `idField`; `bodyField` (if any) is the large part.
// `newBody`: the body any device gives an item it creates without user
// input, the base of a merge where the devices never agreed on one (so
// untouched defaults count as unchanged).
function list({
  name,
  gate,
  key,
  idField = "id",
  bodyField,
  newBody,
  ordered = true,
  secrets,
}: {
  name: string;
  gate: CollectionGate;
  key: string;
  idField?: string;
  bodyField?: string;
  newBody?: () => unknown[];
  ordered?: boolean;
  secrets?: string[];
}): Collection {
  const split = (item: Item): LocalEntry => {
    if (!bodyField) return { data: item };
    const { [bodyField]: body, ...data } = item;
    return { data, body: Array.isArray(body) ? body : [] };
  };
  const join = (entry: LocalEntry) =>
    (bodyField
      ? { ...(entry.data as Item), [bodyField]: entry.body ?? [] }
      : entry.data) as Item;
  return storedCollection({
    name,
    gate,
    key,
    body: bodyField ? "json" : undefined,
    ordered,
    secrets,
    toEntries: (value) =>
      listEntries(
        (Array.isArray(value) ? value : []).filter(isRecord),
        idField,
        split,
        ordered,
      ),
    fromEntries(entries) {
      const items = new Map<string, Item>();
      for (const [id, entry] of entries)
        if (id !== ORDER_ID && isRecord(entry.data)) items.set(id, join(entry));
      return orderItems(items, entries.get(ORDER_ID)?.data, createdAt);
    },
    mergeBodies: bodyField
      ? (base, mine, theirs, newer, label) =>
          mergeFiles(
            (Array.isArray(base) ? base : newBody?.()) as
              Array<Item & { path: string }> | undefined,
            mine as Array<Item & { path: string }>,
            theirs as Array<Item & { path: string }>,
            newer,
            label,
          )
      : undefined,
  });
}

const LANGUAGE_ID = "value";

export const SYNC_COLLECTIONS: Collection[] = [
  storedCollection({
    name: "language",
    gate: "always",
    key: STORAGE_KEYS.language,
    toEntries: (value) =>
      new Map(
        typeof value === "string" ? [[LANGUAGE_ID, { data: value }]] : [],
      ),
    fromEntries: (entries, previous) =>
      entries.get(LANGUAGE_ID)?.data ?? previous,
  }),
  // Preferences and sync settings: one record per field.
  recordMap("preferences", "always", STORAGE_KEYS.preferences, {
    defaults: DEFAULT_PREFERENCES,
  }),
  recordMap("sync-data", "always", STORAGE_KEYS.syncDataSettings, {
    defaults: DEFAULT_SYNC_DATA_SETTINGS,
  }),
  recordMap("providers", SYNC_PREFERENCES.providers, STORAGE_KEYS.provider, {
    secrets: ["apiKey"],
  }),
  list({
    name: "agents",
    gate: SYNC_PREFERENCES.agents,
    key: STORAGE_KEYS.agents,
  }),
  list({
    name: "workspaces",
    gate: SYNC_PREFERENCES.agents,
    key: STORAGE_KEYS.agentWorkspaces,
    idField: "agentId",
    bodyField: "files",
    newBody: () => createWorkspace("").files,
    ordered: false,
  }),
  list({
    name: "skills",
    gate: SYNC_PREFERENCES.skills,
    key: STORAGE_KEYS.skills,
    bodyField: "files",
  }),
  recordMap(
    "skill-settings",
    SYNC_PREFERENCES.skills,
    STORAGE_KEYS.skillSettings,
  ),
  list({
    name: "mcp-servers",
    gate: SYNC_PREFERENCES.mcpServers,
    key: STORAGE_KEYS.mcpServers,
    secrets: ["headers"],
  }),
  list({
    name: "bridges",
    gate: SYNC_PREFERENCES.localExecutionBridges,
    key: STORAGE_KEYS.localExecutionBridges,
    secrets: ["secret", "bridgeKey"],
  }),
  chatsCollection,
  attachmentsCollection,
];

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

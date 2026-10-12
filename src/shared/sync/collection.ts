import type { SyncPreferenceKey } from "../storage-keys";
import type { SyncEnv } from "./env";

// A collection maps one kind of local data to records `<name>/<id>`. Small
// fields are the record's `data`; large content (`body`) goes to a blob.

// `body` undefined: the collection has no body, or (lazy collections) this
// device does not hold it.
export type LocalEntry = { data: unknown; body?: unknown };

// Which setting turns a collection on: always, a data category, or chat
// attachments (WebDAV only).
export type CollectionGate = "always" | "attachments" | SyncPreferenceKey;

// Lazy collections read only the bodies that may have changed.
export type NeedsBody = (id: string) => boolean;

export type Change = { id: string; entry: LocalEntry | null };

export type Collection = {
  name: string;
  gate: CollectionGate;
  // Allowed on the browser-sync backend (chats and attachments are not).
  browserSync: boolean;
  // Local storage keys holding this collection; a change marks it dirty.
  // A key ending in "/" is a prefix (one key per item).
  keys: string[];
  // Bodies are JSON values, or raw bytes.
  body?: "json" | "bytes";
  // Bodies are downloaded only when needed (an opened chat, a shown file).
  lazy?: boolean;
  // Entries in a list order: an `ORDER_ID` entry lists the ids.
  ordered?: boolean;
  read(env: SyncEnv, needsBody: NeedsBody): Promise<Map<string, LocalEntry>>;
  // Writes the changes whose ids pass `verify` (re-checked under the storage
  // lock, so a local edit made meanwhile is never overwritten). Returns the
  // ids written.
  write(
    env: SyncEnv,
    changes: Change[],
    verify: (id: string, current: LocalEntry | undefined) => Promise<boolean>,
  ): Promise<Set<string>>;
  // An entry that must not upload yet (a reply still streaming).
  hold?(entry: LocalEntry): boolean;
  // Both devices changed the body: merge without losing either side.
  mergeBodies?(
    base: unknown,
    mine: unknown,
    theirs: unknown,
    newer: "mine" | "theirs",
    conflictLabel: string,
  ): unknown;
  // Data derived from the body (a chat's message count) after a merge.
  finalizeData?(data: unknown, body: unknown): unknown;
};

export const ORDER_ID = "~order";

export const isOrderId = (id: string) => id === ORDER_ID;

// Storage keys a collection owns.
export function ownsKey(collection: Collection, key: string) {
  return collection.keys.some((owned) =>
    owned.endsWith("/") ? key.startsWith(owned) : key === owned,
  );
}

export function idOfKey(collection: Collection, key: string) {
  const prefix = collection.keys.find(
    (owned) => owned.endsWith("/") && key.startsWith(owned),
  );
  return prefix ? key.slice(prefix.length) : undefined;
}

// Ordered lists: items by id plus the order entry; items the order does not
// name (added concurrently elsewhere) follow by creation time and id.
export function listEntries<T extends Record<string, unknown>>(
  items: T[],
  idField: string,
  split: (item: T) => LocalEntry,
  ordered: boolean,
) {
  const entries = new Map<string, LocalEntry>();
  for (const item of items) {
    const id = item[idField];
    if (typeof id === "string" && id) entries.set(id, split(item));
  }
  if (ordered && entries.size)
    entries.set(ORDER_ID, { data: [...entries.keys()] });
  return entries;
}

export function orderItems<T>(
  items: Map<string, T>,
  order: unknown,
  createdAt: (item: T) => number,
) {
  const listed = Array.isArray(order)
    ? order.filter((id): id is string => typeof id === "string")
    : [];
  const result: T[] = [];
  const placed = new Set<string>();
  for (const id of listed) {
    const item = items.get(id);
    if (item && !placed.has(id)) {
      result.push(item);
      placed.add(id);
    }
  }
  const rest = [...items].filter(([id]) => !placed.has(id));
  rest.sort(
    ([leftId, left], [rightId, right]) =>
      createdAt(left) - createdAt(right) ||
      (leftId < rightId ? -1 : leftId > rightId ? 1 : 0),
  );
  return [...result, ...rest.map(([, item]) => item)];
}

// Apply changes to the entries of one stored value, keeping only verified
// ones. Shared by collections that store all their entries under one key.
export async function applyVerified(
  current: Map<string, LocalEntry>,
  changes: Change[],
  verify: (id: string, current: LocalEntry | undefined) => Promise<boolean>,
) {
  const written = new Set<string>();
  for (const { id, entry } of changes) {
    if (!(await verify(id, current.get(id)))) continue;
    if (entry) current.set(id, entry);
    else current.delete(id);
    written.add(id);
  }
  return written;
}

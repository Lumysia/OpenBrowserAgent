import { SYNCABLE_DATA_ITEMS } from "./storage-keys";
import {
  flushedCache,
  isSyncRouted,
  local,
  pendingItems,
  publishFlushed,
  readSyncCache,
  sameValue,
  syncLocalCacheKey,
  withLock,
  type SyncLocalCache,
} from "./storage-sync-cache";
import { getActiveSyncBackend, type SyncBackend } from "./sync-backends";
import { splitCollection, type Item } from "./sync-split-format";
import { rebaseRecord, rebaseRows } from "./sync-rebase";

// Lazy split collections (see sync-split-format) are stored as a list plus
// one content entry per item, so content is loaded only when needed. The list
// lives under the key like any stored value; each item's content under
// `<key>/<id>`, one copy whether synced or not. While synced, ids whose
// content is not uploaded yet are kept in the list's sync cache entry
// (`items`) and uploaded with it.

const collectionOf = (key: string) => splitCollection(key)!;

export function isSplitStorageKey(key: string) {
  return !!splitCollection(key)?.lazy;
}

export function splitItemKey(key: string, id: string) {
  return `${key}/${id}`;
}

const itemLock = (key: string, id: string) => `item:${splitItemKey(key, id)}`;
const listOf = (value: unknown) =>
  Array.isArray(value) ? (value as Item[]) : [];
export const splitItemIds = (key: string, value: unknown) =>
  listOf(value).map((item) => String(item[collectionOf(key).idField]));

export async function readSplitItem<T>(key: string, id: string) {
  const name = splitItemKey(key, id);
  return (await local().get(name))[name] as T | undefined;
}

// Local write only; see markSplitItemsPending for sync.
export function setSplitItem(key: string, id: string, value: unknown) {
  return withLock(itemLock(key, id), () =>
    local().set({ [splitItemKey(key, id)]: value }),
  );
}

export async function removeSplitItems(key: string, ids: string[]) {
  if (ids.length) await local().remove(ids.map((id) => splitItemKey(key, id)));
}

export async function isSplitSyncRouted(key: string) {
  const item = SYNCABLE_DATA_ITEMS.find((item) => item.dataKey === key);
  return !!item && (await isSyncRouted(item.preferenceKey));
}

export function markSplitItemsPending(key: string, ids: string[]) {
  return withLock(syncLocalCacheKey(key), async () => {
    const cache = await readSyncCache(key);
    const value = cache ? cache.value : (await local().get(key))[key];
    await local().set({
      [syncLocalCacheKey(key)]: {
        value: value ?? [],
        updatedAt: Date.now(),
        items: [...new Set([...pendingItems(cache), ...ids])],
      } satisfies SyncLocalCache<unknown>,
    });
  });
}

// Every item's content is checked against the cloud by the next flush
// (sync turned on), so content the cloud lacks or that changed meanwhile is
// uploaded.
export const splitCacheItems = (key: string, value: unknown) =>
  isSplitStorageKey(key) ? { items: splitItemIds(key, value) } : {};

function heldIds(key: string, value: unknown) {
  const { hold } = collectionOf(key);
  return new Set(hold ? splitItemIds(key, listOf(value).filter(hold)) : []);
}

// Pending content that may upload now (its item is not held).
export function hasUploadableItems(
  key: string,
  cache: SyncLocalCache<unknown>,
) {
  if (!pendingItems(cache).length) return false;
  const held = heldIds(key, cache.value);
  return pendingItems(cache).some((id) => !held.has(id));
}

export class SplitItemUnavailableError extends Error {}

// An item's content, brought up to date from the cloud when synced and this
// device's copy is not pending upload. Throws when it is neither local nor
// available from the cloud.
export async function loadSplitItem<T>(key: string, id: string) {
  const have = await readSplitItem<Item>(key, id);
  const newer = await fetchNewerItem(key, id, have).catch((error) => {
    if (have === undefined) throw error;
  });
  if (newer?.value !== undefined) return newer.value as T;
  if (have === undefined && newer)
    throw new SplitItemUnavailableError(
      `Content of ${splitItemKey(key, id)} is not available.`,
    );
  return have as T | undefined;
}

// Bring a local copy up to date with the cloud; a newer copy is stored.
export async function refreshSplitItem(key: string, id: string) {
  const have = await readSplitItem<Item>(key, id);
  if (have !== undefined) await fetchNewerItem(key, id, have);
}

// Undefined: nothing to check (not synced, or the local copy is pending).
async function fetchNewerItem(key: string, id: string, have: Item | undefined) {
  if (!(await isSplitSyncRouted(key))) return undefined;
  // Local edits upload (and merge) first; the replica stays behind them.
  if (have !== undefined && pendingItems(await readSyncCache(key)).includes(id))
    return undefined;
  const backend = await getActiveSyncBackend();
  const result = await backend.readItem(key, id, have !== undefined);
  if (result.value === undefined) return result;
  return { value: await advanceItem(key, id, have, result.value as Item) };
}

// The sync replica of an item moved from `base` to `next`; the local copy
// follows, keeping what changed locally since `base`. Every path that
// advances the replica goes through here: an upload sets the local copy over
// the replica, so a local copy left behind would undo the other changes.
async function advanceItem(
  key: string,
  id: string,
  base: Item | undefined,
  next: Item,
) {
  return withLock(itemLock(key, id), async () => {
    const current = await readSplitItem<Item>(key, id);
    // Removed meanwhile.
    if (current === undefined && base !== undefined) return undefined;
    const value = sameValue(current, base)
      ? next
      : rebaseRecord(base, current!, next, collectionOf(key).body);
    if (!sameValue(current, value))
      await local().set({ [splitItemKey(key, id)]: value });
    return value;
  });
}

// Send the list with the given ids' local contents; each local copy follows
// the merged result.
async function sendItems(
  backend: SyncBackend,
  key: string,
  value: unknown,
  ids: Iterable<string>,
) {
  const contents: Record<string, Item> = {};
  for (const id of ids) {
    const content = await readSplitItem<Item>(key, id);
    if (content !== undefined) contents[id] = content;
  }
  const result = await backend.writeItems(key, value, contents);
  for (const [id, content] of Object.entries(contents))
    if (result.contents[id] !== undefined)
      await advanceItem(key, id, content, result.contents[id] as Item);
  return result;
}

// Flush of a split collection: the list plus every pending content that is
// not held. Returns whether content is left to upload (edited meanwhile, or
// missing from the cloud).
export async function uploadSplitPending(
  backend: SyncBackend,
  key: string,
  expected: SyncLocalCache<unknown>,
) {
  const held = heldIds(key, expected.value);
  const sent = pendingItems(expected).filter((id) => !held.has(id));
  const result = await sendItems(backend, key, expected.value, sent);
  return withLock(syncLocalCacheKey(key), async () => {
    const current = await readSyncCache(key);
    if (!current) return false;
    const unchanged = sameValue(current.value, expected.value);
    const value = unchanged
      ? result.value
      : rebaseRows(
          listOf(expected.value),
          listOf(current.value),
          listOf(result.value),
          collectionOf(key).idField,
        );
    const listed = new Set(splitItemIds(key, value));
    // Pending stays what is held, was not sent, or differs locally from
    // what the cloud has now.
    const items: string[] = [];
    for (const id of new Set([...pendingItems(current), ...result.missing])) {
      if (!listed.has(id)) continue;
      if (held.has(id)) items.push(id);
      else if (
        sent.includes(id)
          ? !sameValue(await readSplitItem(key, id), result.contents[id])
          : (await readSplitItem(key, id)) !== undefined
      )
        items.push(id);
    }
    const flushed = unchanged && items.every((id) => held.has(id));
    await local().set({
      [syncLocalCacheKey(key)]: {
        ...(flushed
          ? flushedCache(value)
          : { value, updatedAt: current.updatedAt }),
        ...(items.length ? { items } : {}),
      },
    });
    await removeSplitItems(key, removedIds(key, current.value, value));
    return items.some((id) => !held.has(id));
  });
}

// A refreshed list replaces the cache entry; contents of removed items go.
export async function publishSplitRefresh(
  key: string,
  remote: unknown,
  expected: SyncLocalCache<unknown> | undefined,
) {
  if (!(await publishFlushed(key, remote, expected))) return;
  if (remote !== undefined && expected)
    await removeSplitItems(key, removedIds(key, expected.value, remote));
}

function removedIds(key: string, before: unknown, after: unknown) {
  const kept = new Set(splitItemIds(key, after));
  return splitItemIds(key, before).filter((id) => !kept.has(id));
}

// Upload a list with all its local contents (sync turned on).
export async function uploadSplitCollection(
  backend: SyncBackend,
  key: string,
  value: unknown,
) {
  return (await sendItems(backend, key, value, splitItemIds(key, value))).value;
}

// Download every content this device does not have yet (sync turned off or
// moved to another backend), so the list stays complete without the cloud.
// Best effort: once the cloud cannot be reached, the remaining items stay
// listed and their content shows as not available.
export async function materializeSplitItems(
  backend: SyncBackend,
  key: string,
  value: unknown,
) {
  for (const id of splitItemIds(key, value)) {
    if ((await readSplitItem(key, id)) !== undefined) continue;
    const result = await backend.readItem(key, id, false).catch(() => {});
    if (!result) return;
    if (result.value !== undefined) await setSplitItem(key, id, result.value);
  }
}

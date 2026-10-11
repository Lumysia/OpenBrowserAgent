import { isChatRunActive } from "./chats";
import { STORAGE_KEYS, SYNCABLE_DATA_ITEMS } from "./storage-keys";
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
import {
  getActiveSyncBackend,
  type SyncBackend,
  type SyncItemRead,
} from "./sync-backends";
import { rebaseRecord, rebaseRows } from "./sync-rebase";
import type { ChatSummary } from "./types";

// Split collections are stored as a list plus one content entry per item, so
// content is loaded only when needed. The list lives under the key like any
// stored value; each item's content under `<key>/<id>`, one copy whether
// synced or not. While synced, ids whose content is not uploaded yet are kept
// in the list's sync cache entry (`items`) and uploaded with it.

type Item = Record<string, unknown>;

export const SPLIT_ITEMS: Record<
  string,
  {
    idField: string;
    // Content fields: arrays keyed by the given field.
    content: Record<string, string>;
    // Content that must not upload yet; it stays pending.
    hold?: (item: Item) => boolean;
  }
> = {
  [STORAGE_KEYS.chats]: {
    idField: "id",
    content: { messages: "id", sources: "id", imageGenerationJobs: "id" },
    // A streaming reply uploads once it has finished.
    hold: (item) => isChatRunActive(item as ChatSummary),
  },
};

export function isSplitStorageKey(key: string) {
  return Object.hasOwn(SPLIT_ITEMS, key);
}

export function splitItemKey(key: string, id: string) {
  return `${key}/${id}`;
}

const itemLock = (key: string, id: string) => `item:${splitItemKey(key, id)}`;
export const splitItemIds = (key: string, value: unknown) =>
  (Array.isArray(value) ? (value as Item[]) : []).map((item) =>
    String(item[SPLIT_ITEMS[key].idField]),
  );

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

// An item's content, brought up to date from the cloud when synced and this
// device's copy is not pending upload. Throws when it is neither local nor
// available from the cloud.
export async function loadSplitItem<T>(key: string, id: string) {
  const have = await readSplitItem<T>(key, id);
  const newer = await fetchNewerItem(key, id, have !== undefined).catch(
    (error) => {
      if (have === undefined) throw error;
    },
  );
  if (newer?.value !== undefined) return newer.value as T;
  if (have === undefined && newer)
    throw new Error(`Content of ${splitItemKey(key, id)} is not available.`);
  return have;
}

// Bring a local copy up to date with the cloud; a newer copy is stored.
export async function refreshSplitItem(key: string, id: string) {
  await fetchNewerItem(key, id, true);
}

// Undefined: nothing to check (not synced, or the local copy is pending).
async function fetchNewerItem(
  key: string,
  id: string,
  have: boolean,
): Promise<SyncItemRead | undefined> {
  if (!(await isSplitSyncRouted(key))) return undefined;
  if (pendingItems(await readSyncCache(key)).includes(id)) return undefined;
  const result = await (await getActiveSyncBackend()).readItem(key, id, have);
  if (result.value === undefined) return result;
  return withLock(itemLock(key, id), async () => {
    // Edited meanwhile: the local copy uploads and merges next.
    if (pendingItems(await readSyncCache(key)).includes(id))
      return { unchanged: true };
    await local().set({ [splitItemKey(key, id)]: result.value });
    return result;
  });
}

// Flush of a split collection: the list plus every pending content that is
// not held. The merged result is applied to what changed locally meanwhile.
export async function uploadSplitPending(
  backend: SyncBackend,
  key: string,
  expected: SyncLocalCache<unknown>,
) {
  const { hold } = SPLIT_ITEMS[key];
  const list = (expected.value ?? []) as Item[];
  const held = new Set(
    hold
      ? splitItemIds(
          key,
          list.filter((item) => hold(item)),
        )
      : [],
  );
  const contents: Record<string, unknown> = {};
  for (const id of pendingItems(expected)) {
    if (held.has(id)) continue;
    const content = await readSplitItem(key, id);
    if (content !== undefined) contents[id] = content;
  }
  const result = await backend.writeItems(key, expected.value, contents);
  const changed = await applyMergedItems(key, contents, result.contents);
  await withLock(syncLocalCacheKey(key), async () => {
    const current = await readSyncCache(key);
    if (!current) return;
    const value = sameValue(current.value, expected.value)
      ? result.value
      : rebaseRows(
          list,
          current.value as Item[],
          result.value as Item[],
          SPLIT_ITEMS[key].idField,
        );
    const sent = new Set(pendingItems(expected));
    const items = pendingItems(current).filter(
      (id) => held.has(id) || changed.has(id) || !sent.has(id),
    );
    const flushed =
      sameValue(current.value, expected.value) &&
      items.every((id) => held.has(id));
    await local().set({
      [syncLocalCacheKey(key)]: {
        ...(flushed ? flushedCache(value) : { ...current, value }),
        ...(items.length ? { items } : {}),
      },
    });
    await removeSplitItems(key, removedIds(key, current.value, value));
  });
}

// Write merged contents back; returns ids edited meanwhile (still pending).
async function applyMergedItems(
  key: string,
  sent: Record<string, unknown>,
  merged: Record<string, unknown>,
) {
  const changed = new Set<string>();
  for (const [id, content] of Object.entries(sent)) {
    const next = merged[id];
    await withLock(itemLock(key, id), async () => {
      const current = await readSplitItem<Item>(key, id);
      if (current === undefined || next === undefined) return;
      if (sameValue(current, content)) {
        if (!sameValue(current, next))
          await local().set({ [splitItemKey(key, id)]: next });
        return;
      }
      changed.add(id);
      await local().set({
        [splitItemKey(key, id)]: rebaseRecord(
          content as Item,
          current,
          next as Item,
          SPLIT_ITEMS[key].content,
        ),
      });
    });
  }
  return changed;
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
  const contents: Record<string, unknown> = {};
  for (const id of splitItemIds(key, value)) {
    const content = await readSplitItem(key, id);
    if (content !== undefined) contents[id] = content;
  }
  const result = await backend.writeItems(key, value, contents);
  await applyMergedItems(key, contents, result.contents);
  return result.value;
}

// Download every content this device does not have yet (sync turned off or
// moved to another backend), so the list stays complete without the cloud.
export async function materializeSplitItems(
  backend: SyncBackend,
  key: string,
  value: unknown,
) {
  for (const id of splitItemIds(key, value)) {
    if ((await readSplitItem(key, id)) !== undefined) continue;
    const result = await backend.readItem(key, id, false);
    if (result.value !== undefined) await setSplitItem(key, id, result.value);
  }
}

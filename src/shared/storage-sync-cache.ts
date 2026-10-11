import { getBrowserApi } from "./browser-api";
import {
  mergeSyncDataSettings,
  STORAGE_KEYS,
  type SyncDataSettings,
  type SyncPreferenceKey,
} from "./storage-keys";
import { isSyncBackendEnabled, type SyncBackend } from "./sync-backends";

// While a key is synced, the value the user sees is its local cache entry:
// pending (no flushedAt) until the backend accepted it, then flushed. The plain
// local key is kept as the device's own copy and is never deleted here.
export type SyncLocalCache<T> = {
  value: T;
  updatedAt: number;
  flushedAt?: number;
  // Split collections: ids whose local content is not uploaded yet.
  items?: string[];
};

export type SyncWriteStatus = {
  pendingCount: number;
  activeCount?: number;
  pendingItems?: Array<{
    key: string;
    operation: "write" | "remove";
    backendName: string;
    backendType: SyncBackend["config"]["type"];
  }>;
  lastUpdatedAt?: number;
  lastFlushedAt?: number;
  lastError?: string;
};

export const DEFAULT_SYNC_WRITE_STATUS: SyncWriteStatus = { pendingCount: 0 };

export const local = () => getBrowserApi().storage.local;
export const sameValue = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
export const pendingCache = (value: unknown) => ({
  value,
  updatedAt: Date.now(),
});
export const flushedCache = (value: unknown) => ({
  ...pendingCache(value),
  flushedAt: Date.now(),
});

const lockQueues = new Map<string, Promise<unknown>>();

// Web Locks serialize the extension pages and the background; the fallback
// serializes callers within one context.
export function withLock<T>(name: string, operation: () => Promise<T>) {
  const lockName = `openbrowseragent:${name}`;
  if (globalThis.navigator?.locks)
    return navigator.locks.request(lockName, operation) as Promise<T>;
  const next = (lockQueues.get(lockName) || Promise.resolve())
    .catch(() => undefined)
    .then(operation);
  lockQueues.set(lockName, next);
  return next;
}

export function syncLocalCacheKey(key: string) {
  return `${key}:sync-local-cache`;
}

export async function readSyncCache<T>(key: string) {
  const cacheKey = syncLocalCacheKey(key);
  return (await local().get(cacheKey))[cacheKey] as
    SyncLocalCache<T> | undefined;
}

// Pending item contents stay pending until a flush uploads them.
export function writePendingSyncValue<T>(key: string, value: T) {
  return withLock(syncLocalCacheKey(key), async () => {
    const items = pendingItems(await readSyncCache(key));
    await local().set({
      [syncLocalCacheKey(key)]: {
        ...pendingCache(value),
        ...(items.length ? { items } : {}),
      },
    });
  });
}

export function pendingItems(cache: SyncLocalCache<unknown> | undefined) {
  return cache?.items ?? [];
}

// Publish a backend result only if the cache entry is still the one the caller
// read. A flush or refresh must never overwrite a newer pending edit.
export async function publishFlushed(
  key: string,
  value: unknown,
  expected: SyncLocalCache<unknown> | undefined,
) {
  return withLock(syncLocalCacheKey(key), async () => {
    const current = await readSyncCache(key);
    if (!sameValue(current, expected)) return false;
    if (value === undefined) await local().remove(syncLocalCacheKey(key));
    else if (
      current?.flushedAt === undefined ||
      !sameValue(current.value, value)
    ) {
      // Held item contents (see storage-split) stay pending.
      const items = pendingItems(current);
      await local().set({
        [syncLocalCacheKey(key)]: {
          ...flushedCache(value),
          ...(items.length ? { items } : {}),
        },
      });
    }
    return true;
  });
}

// Synced value with the device's local copy as fallback.
export async function readSyncedValue<T>(key: string) {
  if (await isSyncBackendEnabled()) {
    const cached = (await readSyncCache<T>(key))?.value;
    if (cached !== undefined) return cached;
  }
  return (await local().get(key))[key] as T | undefined;
}

export async function readSyncDataSettings() {
  return mergeSyncDataSettings(
    await readSyncedValue<SyncDataSettings>(STORAGE_KEYS.syncDataSettings),
  );
}

// `true` routes an always-synced key (language, preferences, settings).
export async function isSyncRouted(preference: SyncPreferenceKey | true) {
  if (!(await isSyncBackendEnabled())) return false;
  return preference === true || (await readSyncDataSettings())[preference];
}

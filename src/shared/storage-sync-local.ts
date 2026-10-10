import { getBrowserApi } from "./browser-api";
import { sameStorageValue } from "./storage-value";
import { withStorageLock, withStoragePublicationLock } from "./storage-lock";
import { STORAGE_KEYS, type SyncPreferenceKey } from "./storage-keys";
import {
  mergeSyncDataSettings,
  type SyncDataSettings,
} from "./sync-data-settings";

export type SyncLocalCache<T> = {
  value: T;
  updatedAt: number;
  flushedAt?: number;
  removed?: true;
  localBaseBackendId?: string;
};
type CacheGuard = {
  expected: SyncLocalCache<unknown> | undefined;
  backendId?: string;
  // Effective-value readers and notifications also depend on this category.
  // Queue settlement keeps its existing ownsSyncKey/legacy settings policy.
  syncPreferenceKey?: SyncPreferenceKey;
};

async function acceptsRoute(guard?: CacheGuard) {
  if (guard?.backendId) {
    const values = await getBrowserApi().storage.local.get(
      STORAGE_KEYS.activeSyncBackendId,
    );
    if (values[STORAGE_KEYS.activeSyncBackendId] !== guard.backendId)
      return false;
  }
  if (!guard?.syncPreferenceKey) return true;
  const settings = await readSyncLocalCache<SyncDataSettings>(
    STORAGE_KEYS.syncDataSettings,
  );
  return (
    mergeSyncDataSettings(settings?.value)[guard.syncPreferenceKey] === true
  );
}

export function syncLocalCacheKey(key: string) {
  return `${key}:sync-local-cache`;
}

// Cache mutations originate in options, sidepanel and background. A shared Web
// Lock makes the compare-and-publish atomic across those extension contexts.
export function withCacheLock<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withStorageLock(syncLocalCacheKey(key), operation);
}

function withCachePublication<T>(key: string, operation: () => Promise<T>) {
  return withCacheLock(key, () => withStoragePublicationLock(operation));
}

export async function readSyncLocalCache<T>(key: string) {
  const result = await getBrowserApi().storage.local.get(
    syncLocalCacheKey(key),
  );
  return result[syncLocalCacheKey(key)] as SyncLocalCache<T> | undefined;
}

export async function writeSyncLocalCache<T>(key: string, value: T) {
  await withCachePublication(key, () =>
    getBrowserApi().storage.local.set({
      [syncLocalCacheKey(key)]: {
        value,
        updatedAt: Date.now(),
      } satisfies SyncLocalCache<T>,
    }),
  );
}

export function stageSyncRemoval(key: string) {
  return withCachePublication(key, () =>
    getBrowserApi().storage.local.set({
      [syncLocalCacheKey(key)]: {
        value: undefined,
        removed: true,
        updatedAt: Date.now(),
      } satisfies SyncLocalCache<undefined>,
    }),
  );
}

export function removeSyncLocalCache(key: string, guard?: CacheGuard) {
  return withCachePublication(key, async () => {
    if (!(await acceptsRoute(guard))) return false;
    if (
      guard &&
      !sameStorageValue(await readSyncLocalCache(key), guard.expected)
    )
      return false;
    await getBrowserApi().storage.local.remove(syncLocalCacheKey(key));
    return true;
  });
}

export function markSyncLocalCacheFlushed<T>(
  key: string,
  value: T,
  guard?: CacheGuard,
) {
  return withCachePublication(key, async () => {
    if (!(await acceptsRoute(guard))) return false;
    const existing = await readSyncLocalCache<T>(key);
    if (
      guard
        ? !sameStorageValue(existing, guard.expected)
        : existing && existing.flushedAt === undefined
    )
      return false;
    if (
      existing?.flushedAt !== undefined &&
      sameStorageValue(existing.value, value)
    )
      return true;
    const now = Date.now();
    await getBrowserApi().storage.local.set({
      [syncLocalCacheKey(key)]: {
        value,
        updatedAt: now,
        flushedAt: now,
      } satisfies SyncLocalCache<T>,
    });
    return true;
  });
}

export async function readPendingSyncValue<T>(key: string) {
  const cache = await readSyncLocalCache<T>(key);
  return cache && cache.flushedAt === undefined ? cache.value : undefined;
}

export async function readSyncLocalValue<T>(key: string) {
  return (await readSyncLocalCache<T>(key))?.value;
}

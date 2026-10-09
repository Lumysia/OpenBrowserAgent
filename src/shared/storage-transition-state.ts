import { getBrowserApi } from "./browser-api";
import { STORAGE_KEYS, SYNCABLE_DATA_ITEMS } from "./storage-keys";
import { withStorageMutationLock } from "./storage-lock";
import {
  syncLocalCacheKey,
  withCacheLock,
  type SyncLocalCache,
} from "./storage-sync-local";
import { sameStorageValue } from "./storage-value";
import { NO_SYNC_BACKEND_ID } from "./sync-backends";
import {
  mergeSyncDataSettings,
  type SyncDataSettings,
} from "./sync-data-settings";

export class StorageTransitionState {
  constructor(readonly raw: Record<string, unknown>) {}

  get backendId() {
    return (
      (this.raw[STORAGE_KEYS.activeSyncBackendId] as string) ||
      NO_SYNC_BACKEND_ID
    );
  }

  get settings(): SyncDataSettings {
    return mergeSyncDataSettings(this.value(STORAGE_KEYS.syncDataSettings));
  }

  value<T>(key: string): T | undefined {
    const category = SYNCABLE_DATA_ITEMS.find((item) => item.dataKey === key);
    const synced =
      this.backendId !== NO_SYNC_BACKEND_ID &&
      (!category || this.settings[category.preferenceKey]);
    if (synced && this.cache(key)?.removed) return undefined;
    return (
      synced ? (this.cache<T>(key)?.value ?? this.raw[key]) : this.raw[key]
    ) as T | undefined;
  }

  cache<T>(key: string) {
    return this.raw[syncLocalCacheKey(key)] as SyncLocalCache<T> | undefined;
  }

  localBase(key: string) {
    const cache = this.cache(key);
    return cache?.localBaseBackendId
      ? { backendId: cache.localBaseBackendId, value: cache.value }
      : undefined;
  }
}

export function flushedCache(value: unknown) {
  const now = Date.now();
  return { value, updatedAt: now, flushedAt: now };
}

// The source and destination snapshots are validated under the same locks used
// by setters/cache publishers. Remote I/O never holds these locks. If an edit
// arrives in flight, prepare again from current data before switching areas.
export async function runStorageTransition(
  dataKeys: string[],
  prepare: (state: StorageTransitionState) => Promise<Record<string, unknown>>,
  committed?: (values: Record<string, unknown>) => void,
) {
  const keys = [
    ...new Set([STORAGE_KEYS.syncDataSettings, ...dataKeys]),
  ].sort();
  const rawKeys = [
    STORAGE_KEYS.activeSyncBackendId,
    ...keys,
    ...keys.map(syncLocalCacheKey),
  ];
  const locked = <T>(operation: () => Promise<T>) =>
    withStorageMutationLock(() => {
      const lockCache = (index: number): Promise<T> =>
        index === keys.length
          ? operation()
          : withCacheLock(keys[index], () => lockCache(index + 1));
      return lockCache(0);
    });
  const read = async () =>
    Object.assign(
      {},
      ...(await Promise.all(
        rawKeys.map((key) => getBrowserApi().storage.local.get(key)),
      )),
    ) as Record<string, unknown>;
  for (;;) {
    const snapshot = await locked(read);
    const values = await prepare(new StorageTransitionState(snapshot));
    const published = await locked(async () => {
      if (!sameStorageValue(snapshot, await read())) return false;
      // Cache data and its routing flag/backend become visible together.
      await getBrowserApi().storage.local.set(values);
      committed?.(values);
      return true;
    });
    if (published) return;
  }
}

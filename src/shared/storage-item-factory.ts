import { getBrowserApi } from "./browser-api";
import { effectiveArea, STORAGE_AREAS, type AreaName } from "./storage-areas";
import type { StorageItem, StorageItemOptions } from "./storage-item-types";
import {
  markSyncLocalCacheFlushed,
  readSyncLocalCache,
  removeSyncLocalCache,
  syncLocalCacheKey,
  type SyncLocalCache,
} from "./storage-sync-cache";
import {
  isBackendStorageChange,
  watchRemoteValue,
} from "./storage-remote-watch";
import { STORAGE_KEYS } from "./storage-keys";
import { withStorageMutationLock } from "./storage-lock";

type StorageItemIo = {
  readStoredValue<T>(area: AreaName, key: string): Promise<T | undefined>;
  setStoredValue<T>(area: AreaName, key: string, value: T): Promise<void>;
  removeStoredValue(area: AreaName, key: string): Promise<void>;
};

export function makeStorageItemFactory(io: StorageItemIo) {
  function createItem<T>(
    area: AreaName,
    key: string,
    init: () => T,
    normalize?: (value: T) => T,
    options: StorageItemOptions = {},
  ): StorageItem<T> {
    const storageKey = key;
    return {
      key: storageKey,
      area,
      persistDebounceMs: options.persistDebounceMs,
      snapshot: options.snapshot,
      async get() {
        const activeArea = await effectiveArea(area);
        const expected =
          activeArea === STORAGE_AREAS.sync
            ? await readSyncLocalCache<T>(storageKey)
            : undefined;
        if (expected && expected.flushedAt === undefined)
          return expected.removed ? init() : expected.value;
        const storedValue = await io.readStoredValue<T>(area, storageKey);
        if (storedValue === undefined) {
          const initialValue = init();
          if (activeArea === STORAGE_AREAS.sync)
            await markSyncLocalCacheFlushed(storageKey, initialValue, {
              expected,
            });
          return initialValue;
        }
        const value = normalize
          ? normalize(storedValue as T)
          : (storedValue as T);
        if (activeArea === STORAGE_AREAS.sync)
          await markSyncLocalCacheFlushed(storageKey, value, { expected });
        return value;
      },
      async set(value) {
        await withStorageMutationLock(() =>
          io.setStoredValue(
            area,
            storageKey,
            normalize ? normalize(value) : value,
          ),
        );
      },
      async remove() {
        await withStorageMutationLock(() =>
          io.removeStoredValue(area, storageKey),
        );
      },
      watch(callback) {
        const unwatchRemote =
          area === STORAGE_AREAS.sync
            ? watchRemoteValue<T>(storageKey, async (change, backendId) => {
                const expected = await readSyncLocalCache<T>(storageKey);
                if (expected && expected.flushedAt === undefined) return;
                let published: boolean;
                if (change.newValue !== undefined) {
                  published = await markSyncLocalCacheFlushed(
                    storageKey,
                    change.newValue,
                    { expected, backendId },
                  );
                } else {
                  published = await removeSyncLocalCache(storageKey, {
                    expected,
                    backendId,
                  });
                }
                if (published)
                  callback(change.newValue as T, change.oldValue as T);
              })
            : undefined;
        const listener = async (
          changes: Record<string, chrome.storage.StorageChange>,
          changedArea: string,
        ) => {
          if (
            area === STORAGE_AREAS.sync &&
            changedArea === STORAGE_AREAS.local &&
            changes[STORAGE_KEYS.activeSyncBackendId]
          ) {
            const next = await io.readStoredValue<T>(area, storageKey);
            if (next !== undefined)
              callback(normalize ? normalize(next) : next, next as T);
            return;
          }
          const watchArea = await effectiveArea(area);
          if (
            watchArea === STORAGE_AREAS.sync &&
            isBackendStorageChange(storageKey, changedArea)
          )
            return;
          if (
            watchArea === STORAGE_AREAS.sync &&
            changedArea === STORAGE_AREAS.local &&
            changes[syncLocalCacheKey(storageKey)]
          ) {
            const next = changes[syncLocalCacheKey(storageKey)].newValue as
              SyncLocalCache<T> | undefined;
            const previous = changes[syncLocalCacheKey(storageKey)].oldValue as
              SyncLocalCache<T> | undefined;
            if (!next) {
              callback(undefined as T, previous?.value as T);
              return;
            }
            callback(next.value, previous?.value as T);
            return;
          }
          if (changedArea !== watchArea || !changes[storageKey]) return;
          callback(
            changes[storageKey].newValue as T,
            changes[storageKey].oldValue as T,
          );
        };
        getBrowserApi().storage.onChanged.addListener(listener);
        return () => {
          unwatchRemote?.();
          getBrowserApi().storage.onChanged.removeListener(listener);
        };
      },
    };
  }

  function createMigratedItem<T>(
    area: AreaName,
    fallbackArea: AreaName,
    key: string,
    init: () => T,
    merge?: (value: T) => T,
  ): StorageItem<T> {
    const item = createItem(area, key, init);
    return {
      ...item,
      async get() {
        const activeArea = await effectiveArea(area);
        const expected =
          activeArea === STORAGE_AREAS.sync
            ? await readSyncLocalCache<T>(key)
            : undefined;
        if (expected && expected.flushedAt === undefined)
          return expected.removed
            ? init()
            : merge
              ? merge(expected.value)
              : expected.value;
        const storedValue = await io.readStoredValue<T>(area, key);
        if (storedValue !== undefined) {
          const value = merge ? merge(storedValue as T) : (storedValue as T);
          if (activeArea === STORAGE_AREAS.sync)
            await markSyncLocalCacheFlushed(key, value, { expected });
          return value;
        }

        const fallback = await io.readStoredValue<T>(fallbackArea, key);
        const initialValue = fallback === undefined ? init() : fallback;
        const value = merge ? merge(initialValue) : initialValue;
        if (activeArea === STORAGE_AREAS.sync)
          await markSyncLocalCacheFlushed(key, value, { expected });
        return value;
      },
    };
  }

  return { createItem, createMigratedItem };
}

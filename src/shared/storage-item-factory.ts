import { getBrowserApi } from "./browser-api";
import { effectiveArea, STORAGE_AREAS, type AreaName } from "./storage-areas";
import type { StorageItem, StorageItemOptions } from "./storage-item-types";
import {
  markSyncLocalCacheFlushed,
  readPendingSyncValue,
  removeSyncLocalCache,
  syncLocalCacheKey,
  type SyncLocalCache,
} from "./storage-sync-cache";
import {
  isBackendStorageChange,
  watchRemoteValue,
} from "./storage-remote-watch";
import { STORAGE_KEYS } from "./storage-keys";

type StorageItemIo = {
  readStoredValue<T>(area: AreaName, key: string): Promise<T | undefined>;
  setStoredValue<T>(area: AreaName, key: string, value: T): Promise<void>;
  setStoredValueNow<T>(area: AreaName, key: string, value: T): Promise<void>;
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
      async get() {
        if (area === STORAGE_AREAS.sync) {
          const pending = await readPendingSyncValue<T>(storageKey);
          if (pending !== undefined) return pending;
        }
        const storedValue = await io.readStoredValue<T>(area, storageKey);
        if (storedValue === undefined) {
          const initialValue = init();
          await io.setStoredValueNow(area, storageKey, initialValue);
          if (area === STORAGE_AREAS.sync)
            await markSyncLocalCacheFlushed(storageKey, initialValue);
          return initialValue;
        }
        const value = normalize
          ? normalize(storedValue as T)
          : (storedValue as T);
        if (area === STORAGE_AREAS.sync)
          await markSyncLocalCacheFlushed(storageKey, value);
        return value;
      },
      async set(value) {
        await io.setStoredValue(
          area,
          storageKey,
          normalize ? normalize(value) : value,
        );
      },
      async remove() {
        await io.removeStoredValue(area, storageKey);
      },
      watch(callback) {
        const unwatchRemote =
          area === STORAGE_AREAS.sync
            ? watchRemoteValue<T>(storageKey, async (change) => {
                if (change.newValue !== undefined) {
                  await markSyncLocalCacheFlushed(storageKey, change.newValue);
                } else {
                  await removeSyncLocalCache(storageKey);
                }
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
              | SyncLocalCache<T>
              | undefined;
            const previous = changes[syncLocalCacheKey(storageKey)].oldValue as
              | SyncLocalCache<T>
              | undefined;
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
        if (area === STORAGE_AREAS.sync) {
          const pending = await readPendingSyncValue<T>(key);
          if (pending !== undefined) return merge ? merge(pending) : pending;
        }
        const storedValue = await io.readStoredValue<T>(area, key);
        if (storedValue !== undefined) {
          const value = merge ? merge(storedValue as T) : (storedValue as T);
          if (area === STORAGE_AREAS.sync)
            await markSyncLocalCacheFlushed(key, value);
          return value;
        }

        const fallback = await io.readStoredValue<T>(fallbackArea, key);
        const initialValue = fallback === undefined ? init() : fallback;
        const value = merge ? merge(initialValue) : initialValue;
        await io.setStoredValueNow(area, key, value);
        if (area === STORAGE_AREAS.sync)
          await markSyncLocalCacheFlushed(key, value);
        return value;
      },
    };
  }

  return { createItem, createMigratedItem };
}

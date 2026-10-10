import { getBrowserApi } from "./browser-api";
import { effectiveArea, STORAGE_AREAS, type AreaName } from "./storage-areas";
import type {
  StorageItem,
  StorageItemOptions,
  StorageItemIo,
} from "./storage-item-types";
import { createStorageItemValue } from "./storage-item-value";
import {
  markSyncLocalCacheFlushed,
  readSyncLocalCache,
  removeSyncLocalCache,
  syncLocalCacheKey,
  type SyncLocalCache,
} from "./storage-sync-cache";
import { watchRemoteValue } from "./storage-remote-watch";
import { STORAGE_KEYS } from "./storage-keys";
import { withStorageMutationLock } from "./storage-lock";

export function makeStorageItemFactory(io: StorageItemIo) {
  function createItem<T>(
    area: AreaName,
    key: string,
    init: () => T,
    normalize?: (value: T) => T,
    options: StorageItemOptions = {},
    fallbackArea?: AreaName,
  ): StorageItem<T> {
    const storageKey = key;
    const values = createStorageItemValue({
      key,
      init,
      normalize,
      activeArea: () => effectiveArea(area),
      readStoredValue: io.readStoredValue,
      fallbackArea: () => fallbackArea,
    });
    return {
      key: storageKey,
      area,
      persistDebounceMs: options.persistDebounceMs,
      snapshot: options.snapshot,
      get: () => values.read(),
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
      watch(onChange) {
        const observer = values.watch(onChange);
        const unwatchRemote =
          area === STORAGE_AREAS.sync
            ? watchRemoteValue<T>(storageKey, async (change, backendId) => {
                const notify = observer.begin();
                if ((await effectiveArea(area)) !== STORAGE_AREAS.sync) {
                  await notify();
                  return;
                }
                const expected = await readSyncLocalCache<T>(storageKey);
                if (expected && expected.flushedAt === undefined) {
                  await notify();
                  return;
                }
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
                await notify(
                  published ? change.newValue : undefined,
                  change.oldValue,
                );
              })
            : undefined;
        const listener = async (
          changes: Record<string, chrome.storage.StorageChange>,
          changedArea: string,
        ) => {
          if (changedArea !== STORAGE_AREAS.local) return;
          if (
            !changes[storageKey] &&
            !(
              area === STORAGE_AREAS.sync &&
              (changes[syncLocalCacheKey(storageKey)] ||
                changes[STORAGE_KEYS.activeSyncBackendId])
            )
          )
            return;
          const notify = observer.begin();
          if (
            area === STORAGE_AREAS.sync &&
            changedArea === STORAGE_AREAS.local &&
            changes[STORAGE_KEYS.activeSyncBackendId]
          ) {
            await notify();
            return;
          }
          const watchArea = await effectiveArea(area);
          if (
            watchArea === STORAGE_AREAS.sync &&
            changedArea === STORAGE_AREAS.local &&
            changes[syncLocalCacheKey(storageKey)]
          ) {
            const next = changes[syncLocalCacheKey(storageKey)].newValue as
              SyncLocalCache<T> | undefined;
            const previous = changes[syncLocalCacheKey(storageKey)].oldValue as
              SyncLocalCache<T> | undefined;
            await notify(
              next?.value,
              previous?.value,
              previous?.removed === true && previous.flushedAt === undefined,
            );
            return;
          }
          if (changedArea !== watchArea || !changes[storageKey]) {
            await notify();
            return;
          }
          await notify(
            changes[storageKey].newValue as T,
            changes[storageKey].oldValue as T,
          );
        };
        getBrowserApi().storage.onChanged.addListener(listener);
        return () => {
          observer.dispose();
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
    return createItem(area, key, init, merge, {}, fallbackArea);
  }

  return { createItem, createMigratedItem };
}

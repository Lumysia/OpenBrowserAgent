import { getBrowserApi } from "./browser-api";
import {
  areaForSyncEnabled,
  effectiveArea,
  otherStorageArea,
  STORAGE_AREAS,
  type AreaName,
} from "./storage-areas";
import type {
  StorageItem,
  StorageItemIo,
  StorageItemOptions,
} from "./storage-item-types";
import { createStorageItemValue } from "./storage-item-value";
import { withStorageMutationLock } from "./storage-lock";
import {
  isBackendStorageChange,
  watchRemoteValue,
} from "./storage-remote-watch";
import {
  markSyncLocalCacheFlushed,
  readSyncLocalCache,
  removeSyncLocalCache,
  syncLocalCacheKey,
  type SyncLocalCache,
} from "./storage-sync-local";
import { STORAGE_KEYS, type SyncPreferenceKey } from "./storage-keys";
import {
  mergeSyncDataSettings,
  type SyncDataSettings,
} from "./sync-data-settings";

export function makeSwitchableItemFactory(
  io: StorageItemIo,
  getSettings: () => Promise<SyncDataSettings>,
) {
  return function createSwitchableItem<T>(
    key: string,
    init: () => T,
    syncPreferenceKey: SyncPreferenceKey,
    normalize?: (value: T) => T,
    options: StorageItemOptions = {},
  ): StorageItem<T> & { update: (updater: (current: T) => T) => Promise<T> } {
    const areaFor = (settings: SyncDataSettings) =>
      areaForSyncEnabled(settings[syncPreferenceKey] === true);
    const activeArea = async () => effectiveArea(areaFor(await getSettings()));
    const normalizeValue = (value: T) => (normalize ? normalize(value) : value);
    const values = createStorageItemValue({
      key,
      init,
      normalize,
      activeArea,
      syncPreferenceKey,
      readStoredValue: io.readStoredValue,
      fallbackArea: (area) =>
        area === STORAGE_AREAS.sync ? STORAGE_AREAS.local : undefined,
    });
    const readFrom = (area: AreaName) => io.readStoredValue<T>(area, key);

    async function setValue(value: T) {
      const area = await activeArea();
      await io.setStoredValue(area, key, normalizeValue(value));
      const inactiveArea = await effectiveArea(otherStorageArea(area));
      if (area === STORAGE_AREAS.sync && inactiveArea !== area)
        await io.removeStoredValue(inactiveArea, key);
    }

    async function preserveValueForRemoteSyncDisable(
      oldArea: AreaName,
      newArea: AreaName,
    ) {
      await withStorageMutationLock(async () => {
        const fromArea = await effectiveArea(oldArea);
        const toArea = await effectiveArea(newArea);
        if (fromArea !== STORAGE_AREAS.sync || toArea !== STORAGE_AREAS.local)
          return;
        const [sourceValue, targetValue] = await Promise.all([
          readFrom(fromArea),
          readFrom(toArea),
        ]);
        if (sourceValue !== undefined && targetValue === undefined)
          await io.setStoredValue(toArea, key, normalizeValue(sourceValue));
      });
    }

    return {
      key,
      area: STORAGE_AREAS.local,
      persistDebounceMs: options.persistDebounceMs,
      snapshot: options.snapshot,
      get: () => values.read(),
      async set(value) {
        await withStorageMutationLock(() => setValue(value));
      },
      update(updater) {
        return withStorageMutationLock(async () => {
          const current = await values.read();
          const next = updater(current);
          if (next !== current) await setValue(next);
          return next;
        });
      },
      async remove() {
        await withStorageMutationLock(() =>
          Promise.all([
            io.removeStoredValue(STORAGE_AREAS.local, key),
            io.removeStoredValue(STORAGE_AREAS.sync, key),
          ]),
        );
      },
      watch(onChange) {
        const observer = values.watch(onChange);
        const unwatchRemote = watchRemoteValue<T>(
          key,
          async (change, backendId) => {
            const notify = observer.begin();
            if ((await activeArea()) !== STORAGE_AREAS.sync) {
              await notify();
              return;
            }
            const expected = await readSyncLocalCache<T>(key);
            if (expected && expected.flushedAt === undefined) {
              await notify();
              return;
            }
            const newValue =
              change.newValue === undefined
                ? undefined
                : normalizeValue(change.newValue);
            const guard = { expected, backendId, syncPreferenceKey };
            const published =
              newValue === undefined
                ? await removeSyncLocalCache(key, guard)
                : await markSyncLocalCacheFlushed(key, newValue, guard);
            await notify(published ? newValue : undefined, change.oldValue);
          },
        );
        const listener = async (
          changes: Record<string, chrome.storage.StorageChange>,
          changedArea: string,
        ) => {
          if (isBackendStorageChange(key, changedArea)) return;
          const cacheChange = changes[syncLocalCacheKey(key)];
          const localChanged = changedArea === STORAGE_AREAS.local;
          const settingsCacheChange =
            localChanged &&
            changes[syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)];
          const settingsLocalChange =
            localChanged && changes[STORAGE_KEYS.syncDataSettings];
          const backendChange =
            localChanged && changes[STORAGE_KEYS.activeSyncBackendId];
          if (
            !cacheChange &&
            !settingsCacheChange &&
            !settingsLocalChange &&
            !backendChange &&
            !changes[key]
          )
            return;
          const notify = observer.begin();
          if (backendChange) {
            await notify();
            return;
          }
          if (settingsCacheChange || settingsLocalChange) {
            const change = (settingsCacheChange ||
              settingsLocalChange) as chrome.storage.StorageChange;
            const previous = settingsCacheChange
              ? (
                  change.oldValue as
                    SyncLocalCache<SyncDataSettings> | undefined
                )?.value
              : (change.oldValue as SyncDataSettings | undefined);
            const next = settingsCacheChange
              ? (
                  change.newValue as
                    SyncLocalCache<SyncDataSettings> | undefined
                )?.value
              : (change.newValue as SyncDataSettings | undefined);
            const oldArea = areaFor(mergeSyncDataSettings(previous));
            const newArea = areaFor(mergeSyncDataSettings(next));
            if (oldArea !== newArea) {
              await preserveValueForRemoteSyncDisable(oldArea, newArea);
            }
            await notify();
            return;
          }
          const area = await activeArea();
          if (area === STORAGE_AREAS.sync && localChanged && cacheChange) {
            const previous = cacheChange.oldValue as
              SyncLocalCache<T> | undefined;
            await notify(
              (cacheChange.newValue as SyncLocalCache<T> | undefined)?.value,
              previous?.value,
              previous?.removed === true && previous.flushedAt === undefined,
            );
          } else if (localChanged && changes[key]) {
            // Synced items may still use their retained inactive local copy.
            // Resolve that route from storage instead of treating the local
            // change as a replacement of an existing synced value.
            await notify(
              area === STORAGE_AREAS.sync
                ? undefined
                : (changes[key].newValue as T),
              changes[key].oldValue as T,
            );
          } else {
            await notify();
          }
        };
        getBrowserApi().storage.onChanged.addListener(listener);
        return () => {
          observer.dispose();
          unwatchRemote();
          getBrowserApi().storage.onChanged.removeListener(listener);
        };
      },
    };
  };
}

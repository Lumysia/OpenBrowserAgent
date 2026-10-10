import { getBrowserApi } from "./browser-api";
import { effectiveArea, STORAGE_AREAS } from "./storage-areas";
import { STORAGE_KEYS, SYNCABLE_DATA_ITEMS } from "./storage-keys";
import { withSyncOwnership } from "./storage-lock";
import {
  queueSyncWrite,
  readSyncLocalValue,
  syncLocalCacheKey,
} from "./storage-sync-cache";
import { activateSyncBackend } from "./storage-sync-transition";
import { flushedCache, runStorageTransition } from "./storage-transition-state";
import { createTransitionUploader } from "./storage-transition-upload";
import {
  mergeSyncDataSettings,
  type SyncDataSettings,
} from "./sync-data-settings";
import { getActiveSyncBackend, NO_SYNC_BACKEND_ID } from "./sync-backends";
import { settleSyncWrites } from "./storage-sync-owner";

export async function readSyncedValue<T>(key: string): Promise<T | undefined> {
  if ((await effectiveArea(STORAGE_AREAS.sync)) === STORAGE_AREAS.sync)
    return readSyncLocalValue<T>(key);
  return (await getBrowserApi().storage.local.get(key))[key] as T | undefined;
}

export function setDataSync(key: keyof SyncDataSettings, enabled: boolean) {
  return withSyncOwnership(async () => {
    const items = SYNCABLE_DATA_ITEMS.filter(
      (item) => item.preferenceKey === key,
    );
    let backend: Awaited<ReturnType<typeof getActiveSyncBackend>> | undefined;
    let upload: ReturnType<typeof createTransitionUploader> | undefined;
    await runStorageTransition(
      items.map((item) => item.dataKey),
      async (state) => {
        // Settling is part of each validated attempt. An edit arriving between
        // settlement and publication changes the snapshot and repeats the work.
        await settleSyncWrites();
        if (enabled && state.backendId === NO_SYNC_BACKEND_ID)
          throw new Error("Enable a sync backend before syncing this data.");
        backend =
          state.backendId !== NO_SYNC_BACKEND_ID
            ? await getActiveSyncBackend()
            : undefined;
        if (backend) upload ??= createTransitionUploader(backend);
        const values: Record<string, unknown> = {};
        for (const { dataKey } of items) {
          const source = state.value(dataKey);
          if (!enabled) {
            if (source !== undefined) values[dataKey] = source;
            if (backend && state.settings[key])
              values[syncLocalCacheKey(dataKey)] = {
                ...state.cache(dataKey),
                value: source,
                localBaseBackendId: backend.config.id,
              };
            continue;
          }
          const local =
            source ??
            (dataKey === STORAGE_KEYS.localExecutionBridges ? [] : undefined);
          const merged = await upload!(
            dataKey,
            local,
            state.localBase(dataKey),
          );
          values[syncLocalCacheKey(dataKey)] = flushedCache(merged);
        }
        const settings = { ...state.settings, [key]: enabled };
        if (backend)
          values[syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)] = {
            value: settings,
            updatedAt: Date.now(),
          };
        else values[STORAGE_KEYS.syncDataSettings] = settings;
        return values;
      },
      (values) => {
        const settings = values[
          syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)
        ] as { value: unknown } | undefined;
        if (backend && settings)
          queueSyncWrite(
            backend,
            STORAGE_KEYS.syncDataSettings,
            settings.value,
            { delayMs: 0 },
          ).catch(() => undefined);
      },
    );
  });
}

export function setActiveSyncBackend(backendId: string) {
  return withSyncOwnership(async () => {
    if (backendId !== NO_SYNC_BACKEND_ID) {
      await activateSyncBackend(backendId);
      return;
    }
    await runStorageTransition(
      [
        STORAGE_KEYS.language,
        STORAGE_KEYS.preferences,
        ...SYNCABLE_DATA_ITEMS.map((item) => item.dataKey),
      ],
      async (state) => {
        await settleSyncWrites();
        const settings = mergeSyncDataSettings({});
        const values: Record<string, unknown> = {
          [STORAGE_KEYS.activeSyncBackendId]: NO_SYNC_BACKEND_ID,
          [STORAGE_KEYS.syncDataSettings]: settings,
          [syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)]:
            flushedCache(settings),
        };
        const keys = [
          STORAGE_KEYS.language,
          STORAGE_KEYS.preferences,
          ...SYNCABLE_DATA_ITEMS.filter(
            (item) => state.settings[item.preferenceKey],
          ).map((item) => item.dataKey),
        ];
        for (const key of keys) {
          const value = state.value(key);
          if (value !== undefined) values[key] = value;
          if (state.backendId !== NO_SYNC_BACKEND_ID)
            values[syncLocalCacheKey(key)] = {
              ...state.cache(key),
              value,
              localBaseBackendId: state.backendId,
            };
        }
        return values;
      },
    );
  });
}

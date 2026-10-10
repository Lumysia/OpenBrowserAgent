import { getBrowserApi } from "./browser-api";
import { DEFAULT_PREFERENCES, mergePreferences } from "./default-preferences";
import { hasUnfinishedChatRun } from "./chats";
import { STORAGE_KEYS, SYNCABLE_DATA_ITEMS } from "./storage-keys";
import { withSyncOwnership } from "./storage-lock";
import {
  queueSyncWrite,
  syncLocalCacheKey,
  type SyncLocalCache,
} from "./storage-sync-cache";
import {
  flushedCache,
  runStorageTransition,
  type StorageTransitionState,
} from "./storage-transition-state";
import { sameStorageValue } from "./storage-value";
import {
  createTransitionUploader,
  rebaseStorageEdit,
} from "./storage-transition-upload";
import { createSyncBackend, getStoredSyncBackends } from "./sync-backends";
import {
  mergeSyncDataSettings,
  type SyncDataSettings,
} from "./sync-data-settings";
import type { Preferences } from "./types";
import { settleSyncWrites } from "./storage-sync-owner";

// Called by the serialized backend transition owner in storage-sync-settings.
export async function activateSyncBackend(backendId: string) {
  const backend = await syncBackendForId(backendId);
  const transfer = createTransitionUploader(backend);
  await runStorageTransition(
    [
      STORAGE_KEYS.language,
      STORAGE_KEYS.preferences,
      ...SYNCABLE_DATA_ITEMS.map((item) => item.dataKey),
    ],
    async (state) => {
      await settleSyncWrites();
      const remoteSettings = await backend.read<SyncDataSettings>(
        STORAGE_KEYS.syncDataSettings,
      );
      const settings = mergeSyncDataSettings(remoteSettings || state.settings);
      const values: Record<string, unknown> = {
        [STORAGE_KEYS.activeSyncBackendId]: backendId,
      };
      const upload = async (key: string, value: unknown) => {
        values[syncLocalCacheKey(key)] = flushedCache(
          await transfer(key, value, state.localBase(key)),
        );
      };
      await upload(
        STORAGE_KEYS.language,
        state.value(STORAGE_KEYS.language) ??
          getBrowserApi().i18n?.getUILanguage?.() ??
          "en-US",
      );
      await upload(
        STORAGE_KEYS.preferences,
        mergePreferences(
          state.value<Preferences & Record<string, unknown>>(
            STORAGE_KEYS.preferences,
          ) ?? DEFAULT_PREFERENCES,
        ),
      );
      if (remoteSettings === undefined)
        await upload(STORAGE_KEYS.syncDataSettings, settings);
      else
        values[syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)] =
          flushedCache(settings);
      for (const item of SYNCABLE_DATA_ITEMS) {
        const local = state.settings[item.preferenceKey]
          ? state.value(item.dataKey)
          : undefined;
        if (!settings[item.preferenceKey] && local !== undefined)
          values[item.dataKey] = local;
        if (local !== undefined) await upload(item.dataKey, local);
        else if (settings[item.preferenceKey]) {
          const remote = await backend.read(item.dataKey);
          // Never activate an unrelated cache left by the previous backend.
          values[syncLocalCacheKey(item.dataKey)] = flushedCache(remote);
        }
      }
      return values;
    },
  );
}

type SyncRestoreOptions = {
  backendId: string;
  language?: string;
  preferences?: Preferences;
  syncDataSettings?: SyncDataSettings;
  data?: Record<string, unknown>;
};

export function restoreSyncBackendFromCloud({
  backendId,
  language,
  preferences,
  syncDataSettings,
  data = {},
}: SyncRestoreOptions) {
  return withSyncOwnership(async () => {
    const backend = await syncBackendForId(backendId);
    const restored = Object.fromEntries(
      Object.entries({
        ...data,
        [STORAGE_KEYS.language]: language,
        [STORAGE_KEYS.preferences]: preferences,
        [STORAGE_KEYS.syncDataSettings]: syncDataSettings,
      }).filter(([, value]) => value !== undefined),
    );
    let initial: StorageTransitionState | undefined;
    await runStorageTransition(
      Object.keys(restored),
      async (state) => {
        initial ??= state;
        const values: Record<string, unknown> = {
          [STORAGE_KEYS.activeSyncBackendId]: backendId,
        };
        for (const [key, cloudValue] of Object.entries(restored)) {
          const sourceChanged = !sameStorageValue(
            state.value(key),
            initial.value(key),
          );
          const cacheChanged = !sameStorageValue(
            state.cache(key)?.value,
            initial.cache(key)?.value,
          );
          const edited = sourceChanged || cacheChanged;
          const value = sourceChanged
            ? rebaseStorageEdit(
                initial.value(key),
                state.value(key),
                cloudValue,
              )
            : cacheChanged
              ? rebaseStorageEdit(
                  initial.cache(key)?.value,
                  state.cache(key)?.value,
                  cloudValue,
                )
              : cloudValue;
          values[key] = value;
          values[syncLocalCacheKey(key)] = edited
            ? { value, updatedAt: Date.now() }
            : flushedCache(value);
        }
        return values;
      },
      (values) => {
        for (const key of Object.keys(restored)) {
          const cache = values[
            syncLocalCacheKey(key)
          ] as SyncLocalCache<unknown>;
          if (
            cache.flushedAt === undefined &&
            !(key === STORAGE_KEYS.chats && hasUnfinishedChatRun(cache.value))
          )
            queueSyncWrite(backend, key, cache.value).catch(() => undefined);
        }
      },
    );
  });
}

async function syncBackendForId(backendId: string) {
  const backends = await getStoredSyncBackends();
  const config = backends.find((backend) => backend.id === backendId);
  if (!config) throw new Error(`Unknown sync backend: ${backendId}`);
  return createSyncBackend(config);
}

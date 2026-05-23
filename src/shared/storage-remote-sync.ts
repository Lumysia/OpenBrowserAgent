import * as config from "./config";
import { mergePreferences } from "./default-preferences";
import {
  getActiveSyncBackend,
  isSyncBackendEnabled,
  type SyncBackend,
} from "./sync-backends";
import {
  markSyncLocalCacheFlushed,
  readPendingSyncValue,
  readSyncLocalValue,
} from "./storage-sync-cache";
import { STORAGE_KEYS, SYNCABLE_DATA_ITEMS } from "./storage-keys";
import { sameStorageValue } from "./storage-value";
import {
  mergeSyncDataSettings,
  type SyncDataSettings,
} from "./sync-data-settings";

export async function refreshSyncFromRemote(
  syncDataSettings: SyncDataSettings,
): Promise<void> {
  const refreshedSyncDataSettings =
    await refreshSyncSettingsFromRemote(syncDataSettings);
  await refreshSyncDataFromRemote(
    refreshedSyncDataSettings || syncDataSettings,
  );
}

export async function refreshSyncSettingsFromRemote(
  syncDataSettings: SyncDataSettings,
): Promise<SyncDataSettings | undefined> {
  if (!(await isSyncBackendEnabled())) return;
  const backend = await getActiveSyncBackend();
  await refreshSyncKey(backend, STORAGE_KEYS.language, {
    writeBackOnChange: false,
  });
  await refreshSyncKey(backend, STORAGE_KEYS.preferences, {
    normalize: mergePreferences,
    writeBackOnChange: false,
  });
  const refreshedSyncDataSettings = await refreshSyncKey<SyncDataSettings>(
    backend,
    STORAGE_KEYS.syncDataSettings,
    { normalize: mergeSyncDataSettings, writeBackOnChange: false },
  );
  const effectiveSyncDataSettings =
    refreshedSyncDataSettings || syncDataSettings;
  if (effectiveSyncDataSettings.syncProviders)
    await refreshSyncKey(backend, STORAGE_KEYS.provider, {
      writeBackOnChange: false,
    });
  return effectiveSyncDataSettings;
}

export async function refreshSyncDataFromRemote(
  syncDataSettings: SyncDataSettings,
): Promise<void> {
  if (!(await isSyncBackendEnabled())) return;
  const backend = await getActiveSyncBackend();

  await Promise.all(
    SYNCABLE_DATA_ITEMS.filter(
      (item) =>
        item.preferenceKey !== "syncProviders" &&
        syncDataSettings[item.preferenceKey] === true,
    ).map((item) => refreshSyncKey(backend, item.dataKey)),
  );
}

async function refreshSyncKey<T>(
  backend: SyncBackend,
  key: string,
  options: {
    normalize?: (value: T) => T;
    writeBackOnChange?: boolean;
  } = {},
) {
  const { normalize, writeBackOnChange = true } = options;
  const pending = await readPendingSyncValue<T>(key);
  if (pending !== undefined) {
    if (key === STORAGE_KEYS.chats && hasUnfinishedChatRun(pending))
      return pending;
    const value = normalize ? normalize(pending) : pending;
    const mergedValue = await backend.write(key, value);
    const nextValue = mergedValue ?? value;
    await markSyncLocalCacheFlushed(key, nextValue);
    return nextValue;
  }

  const previous = await readSyncLocalValue<T>(key);
  const remote = await backend.read<T>(key);
  if (remote === undefined) return undefined;
  const value = normalize ? normalize(remote) : remote;
  if (previous !== undefined && !sameStorageValue(previous, value)) {
    if (!writeBackOnChange) {
      await markSyncLocalCacheFlushed(key, value);
      return value;
    }
    const mergedValue = await backend.write(key, value);
    const nextValue = mergedValue ?? value;
    await markSyncLocalCacheFlushed(key, nextValue);
    return nextValue;
  }
  await markSyncLocalCacheFlushed(key, value);
  return value;
}

function hasUnfinishedChatRun(value: unknown) {
  if (!Array.isArray(value)) return false;
  return value.some((chat) =>
    chat.messages?.some((message: { role?: string; metadata?: unknown }) => {
      if (message.role !== "assistant") return false;
      const metrics = (message.metadata as { runMetrics?: unknown } | undefined)
        ?.runMetrics as { startedAt?: unknown; endedAt?: unknown } | undefined;
      return metrics?.startedAt !== undefined && metrics.endedAt === undefined;
    }),
  );
}

export function syncRemoteRefreshIntervalMs() {
  return config.SYNC_REMOTE_REFRESH_INTERVAL_MS;
}

export function syncSettingsRefreshIntervalMs() {
  return config.SYNC_SETTINGS_REFRESH_INTERVAL_MS;
}

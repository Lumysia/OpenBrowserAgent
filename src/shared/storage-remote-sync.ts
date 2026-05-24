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
  removeSyncLocalCache,
} from "./storage-sync-cache";
import {
  STORAGE_KEYS,
  SYNCABLE_DATA_ITEMS,
  SYNC_PREFERENCES,
} from "./storage-keys";
import { sameStorageValue } from "./storage-value";
import {
  mergeSyncDataSettings,
  type SyncDataSettings,
} from "./sync-data-settings";

const SYNC_SETTINGS_REFRESH_ITEMS = [
  { dataKey: STORAGE_KEYS.language },
  { dataKey: STORAGE_KEYS.preferences },
  { dataKey: STORAGE_KEYS.syncDataSettings },
] as const;

const SYNC_FAST_DATA_REFRESH_ITEMS = [
  { preferenceKey: SYNC_PREFERENCES.providers, dataKey: STORAGE_KEYS.provider },
] as const;

const SYNC_REMOTE_DATA_REFRESH_ITEMS = SYNCABLE_DATA_ITEMS.filter(
  (item) =>
    !SYNC_FAST_DATA_REFRESH_ITEMS.some(
      (fastItem) =>
        fastItem.preferenceKey === item.preferenceKey &&
        fastItem.dataKey === item.dataKey,
    ),
);

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
  const refreshedSettings = await Promise.all(
    SYNC_SETTINGS_REFRESH_ITEMS.map(async (item) => ({
      ...item,
      value: await refreshSyncKey(backend, item.dataKey, {
        normalize: normalizeSyncedSetting,
        writeBackOnChange: false,
      }),
    })),
  );
  const refreshedSyncDataSettings = refreshedSettings.find(
    (item) => item.dataKey === STORAGE_KEYS.syncDataSettings,
  )?.value as SyncDataSettings | undefined;
  const effectiveSyncDataSettings =
    refreshedSyncDataSettings || syncDataSettings;
  await Promise.all(
    SYNC_FAST_DATA_REFRESH_ITEMS.filter(
      (item) => effectiveSyncDataSettings[item.preferenceKey] === true,
    ).map((item) =>
      refreshSyncKey(backend, item.dataKey, { writeBackOnChange: false }),
    ),
  );
  return effectiveSyncDataSettings;
}

export async function refreshSyncDataFromRemote(
  syncDataSettings: SyncDataSettings,
): Promise<void> {
  if (!(await isSyncBackendEnabled())) return;
  const backend = await getActiveSyncBackend();

  await Promise.all(
    SYNC_REMOTE_DATA_REFRESH_ITEMS.filter(
      (item) => syncDataSettings[item.preferenceKey] === true,
    ).map((item) =>
      refreshSyncKey(backend, item.dataKey, {
        missingRemoteValue: missingRemoteValueForSyncedKey(item.dataKey),
      }),
    ),
  );
}

async function refreshSyncKey<T>(
  backend: SyncBackend,
  key: string,
  options: {
    normalize?: (value: T, key: string) => T;
    missingRemoteValue?: T;
    writeBackOnChange?: boolean;
  } = {},
) {
  const { normalize, missingRemoteValue, writeBackOnChange = true } = options;
  const pending = await readPendingSyncValue<T>(key);
  if (pending !== undefined) {
    if (key === STORAGE_KEYS.chats && hasUnfinishedChatRun(pending))
      return pending;
    const value = normalize ? normalize(pending, key) : pending;
    const mergedValue = await backend.write(key, value);
    const nextValue = mergedValue ?? value;
    await markSyncLocalCacheFlushed(key, nextValue);
    return nextValue;
  }

  const previous = await readSyncLocalValue<T>(key);
  const remote = await backend.read<T>(key, previous);
  if (remote === undefined) {
    if (missingRemoteValue !== undefined) {
      const value = normalize
        ? normalize(missingRemoteValue, key)
        : missingRemoteValue;
      const mergedValue = await backend.write(key, value);
      const nextValue = mergedValue ?? value;
      await markSyncLocalCacheFlushed(key, nextValue);
      return nextValue;
    }
    await removeSyncLocalCache(key);
    return undefined;
  }
  const value = normalize ? normalize(remote, key) : remote;
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

function normalizeSyncedSetting<T>(value: T, key: string) {
  if (key === STORAGE_KEYS.preferences)
    return mergePreferences(value as T & Record<string, unknown>) as T;
  if (key === STORAGE_KEYS.syncDataSettings)
    return mergeSyncDataSettings(value as Partial<SyncDataSettings>) as T;
  return value;
}

function missingRemoteValueForSyncedKey(key: string) {
  if (key === STORAGE_KEYS.localExecutionBridges) return [];
  return undefined;
}

export function syncRemoteRefreshIntervalMs() {
  return config.SYNC_REMOTE_REFRESH_INTERVAL_MS;
}

export function syncSettingsRefreshIntervalMs() {
  return config.SYNC_SETTINGS_REFRESH_INTERVAL_MS;
}

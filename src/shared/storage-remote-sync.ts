import * as config from "./config";
import { hasUnfinishedChatRun } from "./chats";
import { mergePreferences } from "./default-preferences";
import {
  getActiveSyncBackend,
  isSyncBackendEnabled,
  type SyncBackend,
} from "./sync-backends";
import {
  markSyncLocalCacheFlushed,
  readSyncLocalCache,
  readSyncLocalValue,
  removeSyncLocalCache,
} from "./storage-sync-cache";
import {
  STORAGE_KEYS,
  SYNCABLE_DATA_ITEMS,
  SYNC_PREFERENCES,
} from "./storage-keys";
import { sameStorageValue } from "./storage-value";
import { withSyncOwnership } from "./storage-lock";
import { ownsSyncKey } from "./storage-sync-owner";
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

function refreshSyncKey<T>(
  backend: SyncBackend,
  key: string,
  options: Parameters<typeof refreshOwnedSyncKey<T>>[2] = {},
) {
  return withSyncOwnership(async () => {
    if (!(await ownsSyncKey(backend.config.id, key)))
      return readSyncLocalValue<T>(key);
    return refreshOwnedSyncKey(backend, key, options);
  });
}

async function refreshOwnedSyncKey<T>(
  backend: SyncBackend,
  key: string,
  options: {
    normalize?: (value: T, key: string) => T;
    missingRemoteValue?: T;
    writeBackOnChange?: boolean;
  } = {},
) {
  const { normalize, missingRemoteValue, writeBackOnChange = true } = options;
  const expected = await readSyncLocalCache<T>(key);
  const pending =
    expected?.flushedAt === undefined ? expected?.value : undefined;
  async function publish(value: T | undefined) {
    const guard = { expected, backendId: backend.config.id };
    if (value === undefined) await removeSyncLocalCache(key, guard);
    else await markSyncLocalCacheFlushed(key, value, guard);
    return readSyncLocalValue<T>(key);
  }
  if (expected?.removed) {
    await backend.remove(key);
    await markSyncLocalCacheFlushed(key, undefined, {
      expected,
      backendId: backend.config.id,
    });
    return readSyncLocalValue<T>(key);
  }
  if (pending !== undefined) {
    if (key === STORAGE_KEYS.chats && hasUnfinishedChatRun(pending))
      return pending;
    const value = normalize ? normalize(pending, key) : pending;
    const mergedValue = await backend.write(key, value);
    const nextValue = mergedValue ?? value;
    return publish(nextValue);
  }

  const previous = expected?.value;
  const remote = await backend.read<T>(key, previous);
  if (remote === undefined) {
    if (missingRemoteValue !== undefined) {
      const value = normalize
        ? normalize(missingRemoteValue, key)
        : missingRemoteValue;
      const mergedValue = await backend.write(key, value);
      const nextValue = mergedValue ?? value;
      return publish(nextValue);
    }
    return publish(undefined);
  }
  const value = normalize ? normalize(remote, key) : remote;
  if (previous !== undefined && sameStorageValue(previous, value)) return value;
  if (previous !== undefined) {
    if (!writeBackOnChange) {
      return publish(value);
    }
    const mergedValue = await backend.write(key, value);
    const nextValue = mergedValue ?? value;
    return publish(nextValue);
  }
  return publish(value);
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

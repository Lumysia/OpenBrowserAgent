import { markSyncLocalCacheFlushed } from "./storage-sync-cache";
import { getBrowserApi } from "./browser-api";
import { STORAGE_KEYS, SYNCABLE_DATA_ITEMS } from "./storage-keys";
import { createSyncBackend, getStoredSyncBackends } from "./sync-backends";
import {
  mergeSyncDataSettings,
  type SyncDataSettings,
} from "./sync-data-settings";
import type { Preferences } from "./types";

type SyncActivationOptions = {
  backendId: string;
  getLanguage: () => Promise<string>;
  getPreferences: () => Promise<Preferences>;
  getSyncDataSettings: () => Promise<SyncDataSettings>;
  readSyncedValue: <T>(key: string) => Promise<T | undefined>;
  setActiveBackendId: (backendId: string) => Promise<void>;
};

type SyncRestoreOptions = {
  backendId: string;
  language?: string;
  preferences?: Preferences;
  syncDataSettings?: SyncDataSettings;
  data?: Record<string, unknown>;
  setActiveBackendId: (backendId: string) => Promise<void>;
};

export async function activateSyncBackend({
  backendId,
  getLanguage,
  getPreferences,
  getSyncDataSettings,
  readSyncedValue,
  setActiveBackendId,
}: SyncActivationOptions) {
  const language = await getLanguage();
  const preferences = await getPreferences();
  const backend = await syncBackendForId(backendId);
  const localSyncDataSettings = await getSyncDataSettings();
  const remoteSyncDataSettings = await backend.read<SyncDataSettings>(
    STORAGE_KEYS.syncDataSettings,
  );
  const syncDataSettings = mergeSyncDataSettings(
    remoteSyncDataSettings || localSyncDataSettings,
  );
  const localUploadSyncDataSettings =
    remoteSyncDataSettings === undefined
      ? syncDataSettings
      : mergeSyncDataSettings(localSyncDataSettings);
  const dataSnapshots = await Promise.all(
    SYNCABLE_DATA_ITEMS.map(async (item) => ({
      ...item,
      value: localUploadSyncDataSettings[item.preferenceKey]
        ? await readSyncedValue(item.dataKey)
        : undefined,
    })),
  );

  const mergedLanguage = await backend.write(STORAGE_KEYS.language, language);
  await markSyncLocalCacheFlushed(
    STORAGE_KEYS.language,
    mergedLanguage ?? language,
  );
  const mergedPreferences = await backend.write(
    STORAGE_KEYS.preferences,
    preferences,
  );
  await markSyncLocalCacheFlushed(
    STORAGE_KEYS.preferences,
    mergedPreferences ?? preferences,
  );
  if (remoteSyncDataSettings === undefined) {
    const mergedSyncDataSettings = await backend.write(
      STORAGE_KEYS.syncDataSettings,
      syncDataSettings,
    );
    await markSyncLocalCacheFlushed(
      STORAGE_KEYS.syncDataSettings,
      mergedSyncDataSettings ?? syncDataSettings,
    );
  } else {
    await markSyncLocalCacheFlushed(
      STORAGE_KEYS.syncDataSettings,
      syncDataSettings,
    );
  }
  for (const item of dataSnapshots) {
    if (item.value === undefined) continue;
    const mergedValue = await backend.write(item.dataKey, item.value);
    await markSyncLocalCacheFlushed(item.dataKey, mergedValue ?? item.value);
  }
  await setActiveBackendId(backendId);
}

export async function restoreSyncBackendFromCloud({
  backendId,
  language,
  preferences,
  syncDataSettings,
  data = {},
  setActiveBackendId,
}: SyncRestoreOptions) {
  const localValues: Record<string, unknown> = {};
  if (language !== undefined) localValues[STORAGE_KEYS.language] = language;
  if (preferences !== undefined)
    localValues[STORAGE_KEYS.preferences] = preferences;
  if (syncDataSettings !== undefined)
    localValues[STORAGE_KEYS.syncDataSettings] = syncDataSettings;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) localValues[key] = value;
  }
  if (Object.keys(localValues).length)
    await getBrowserApi().storage.local.set(localValues);

  if (language !== undefined)
    await markSyncLocalCacheFlushed(STORAGE_KEYS.language, language);
  if (preferences !== undefined)
    await markSyncLocalCacheFlushed(STORAGE_KEYS.preferences, preferences);
  if (syncDataSettings !== undefined)
    await markSyncLocalCacheFlushed(
      STORAGE_KEYS.syncDataSettings,
      syncDataSettings,
    );
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) await markSyncLocalCacheFlushed(key, value);
  }
  await setActiveBackendId(backendId);
}

async function syncBackendForId(backendId: string) {
  const backends = await getStoredSyncBackends();
  const backendConfig = backends.find((backend) => backend.id === backendId);
  if (!backendConfig) throw new Error(`Unknown sync backend: ${backendId}`);
  return createSyncBackend(backendConfig);
}

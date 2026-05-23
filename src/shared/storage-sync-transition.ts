import { markSyncLocalCacheFlushed } from "./storage-sync-cache";
import { getBrowserApi } from "./browser-api";
import { STORAGE_KEYS, SYNCABLE_DATA_ITEMS } from "./storage-keys";
import { createSyncBackend, getStoredSyncBackends } from "./sync-backends";
import type { Preferences } from "./types";

type SyncActivationOptions = {
  backendId: string;
  getLanguage: () => Promise<string>;
  getPreferences: () => Promise<Preferences>;
  readSyncedValue: <T>(key: string) => Promise<T | undefined>;
  setActiveBackendId: (backendId: string) => Promise<void>;
};

type SyncRestoreOptions = {
  backendId: string;
  language?: string;
  preferences?: Preferences;
  data?: Record<string, unknown>;
  setActiveBackendId: (backendId: string) => Promise<void>;
};

export async function activateSyncBackend({
  backendId,
  getLanguage,
  getPreferences,
  readSyncedValue,
  setActiveBackendId,
}: SyncActivationOptions) {
  const language = await getLanguage();
  const preferences = await getPreferences();
  const backend = await syncBackendForId(backendId);
  const dataSnapshots = await Promise.all(
    SYNCABLE_DATA_ITEMS.map(async (item) => ({
      ...item,
      value: preferences[item.preferenceKey]
        ? await readSyncedValue(item.dataKey)
        : undefined,
    })),
  );

  await backend.write(STORAGE_KEYS.language, language);
  await markSyncLocalCacheFlushed(STORAGE_KEYS.language, language);
  await backend.write(STORAGE_KEYS.preferences, preferences);
  await markSyncLocalCacheFlushed(STORAGE_KEYS.preferences, preferences);
  for (const item of dataSnapshots) {
    if (item.value === undefined) continue;
    await backend.write(item.dataKey, item.value);
    await markSyncLocalCacheFlushed(item.dataKey, item.value);
  }
  await setActiveBackendId(backendId);
}

export async function restoreSyncBackendFromCloud({
  backendId,
  language,
  preferences,
  data = {},
  setActiveBackendId,
}: SyncRestoreOptions) {
  const localValues: Record<string, unknown> = {};
  if (language !== undefined) localValues[STORAGE_KEYS.language] = language;
  if (preferences !== undefined)
    localValues[STORAGE_KEYS.preferences] = preferences;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) localValues[key] = value;
  }
  if (Object.keys(localValues).length)
    await getBrowserApi().storage.local.set(localValues);

  if (language !== undefined)
    await markSyncLocalCacheFlushed(STORAGE_KEYS.language, language);
  if (preferences !== undefined)
    await markSyncLocalCacheFlushed(STORAGE_KEYS.preferences, preferences);
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

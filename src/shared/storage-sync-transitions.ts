import { getBrowserApi } from "./browser-api";
import { DEFAULT_PREFERENCES, mergePreferences } from "./default-preferences";
import {
  DEFAULT_SYNC_DATA_SETTINGS,
  mergeSyncDataSettings,
  STORAGE_KEYS,
  SYNCABLE_DATA_ITEMS,
  type SyncDataSettings,
  type SyncPreferenceKey,
} from "./storage-keys";
import {
  flushedCache,
  isSyncRouted,
  local,
  pendingCache,
  queueSyncWrite,
  readSyncCache,
  readSyncDataSettings,
  readSyncedValue,
  recordSyncError,
  sameValue,
  syncLocalCacheKey,
} from "./storage-sync";
import {
  createSyncBackend,
  getActiveSyncBackend,
  getStoredSyncBackends,
  isSyncBackendEnabled,
  NO_SYNC_BACKEND_ID,
  type SyncBackend,
} from "./sync-backends";
import type { Preferences } from "./types";

// Transitions. Each reads current values, talks to the backend, and publishes
// the new caches and routing flag with one storage.local.set. The backend's
// local replica makes uploading a device's copy a three-way merge: rows the
// device never saw are kept, rows it deleted are tombstoned. This holds because
// the plain local copy always descends from the replica: every path that stops
// routing a key through the cache copies the cache value back to it.

// Upload a value until it is still current afterwards, so an edit made during
// the upload (a streaming chat, say) is not hidden behind the published cache.
async function uploadCurrent(
  backend: SyncBackend,
  key: string,
  read: () => Promise<unknown>,
) {
  for (let attempt = 1; ; attempt++) {
    const value = await read();
    const merged =
      value === undefined
        ? await backend.read(key)
        : ((await backend.write(key, value)) ?? value);
    if (attempt === 3 || sameValue(value, await read()))
      return { value, merged };
  }
}

const readLocal = (key: string) => async () =>
  (await local().get(key))[key] as unknown;

export async function setDataSync(
  key: keyof SyncDataSettings,
  enabled: boolean,
) {
  const settings = await readSyncDataSettings();
  const next = { ...settings, [key]: enabled };
  if (!(await isSyncBackendEnabled())) {
    if (enabled)
      throw new Error("Enable a sync backend before syncing this data.");
    await local().set({ [STORAGE_KEYS.syncDataSettings]: next });
    return;
  }
  const backend = await getActiveSyncBackend();
  const values: Record<string, unknown> = {
    [syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)]: pendingCache(next),
  };
  const staleCaches: string[] = [];
  // Re-enabling a synced category must not upload the older local copy.
  const changed = settings[key] !== enabled;
  for (const { dataKey } of SYNCABLE_DATA_ITEMS.filter(
    (item) => changed && item.preferenceKey === key,
  )) {
    if (!enabled) {
      // Disabling never uploads: what the user sees becomes the local copy.
      const value = (await readSyncCache(dataKey))?.value;
      if (value !== undefined) values[dataKey] = value;
      continue;
    }
    // Enabling merges this device's copy into the cloud. On failure the
    // category stays local and the status shows why.
    const { merged } = await uploadCurrent(
      backend,
      dataKey,
      readLocal(dataKey),
    ).catch(async (error) => {
      await recordSyncError(error);
      throw error;
    });
    if (merged === undefined) staleCaches.push(syncLocalCacheKey(dataKey));
    else values[syncLocalCacheKey(dataKey)] = flushedCache(merged);
  }
  if (staleCaches.length) await local().remove(staleCaches);
  await local().set(values);
  queueSyncWrite(backend, STORAGE_KEYS.syncDataSettings);
}

export async function setActiveSyncBackend(backendId: string) {
  if (backendId === NO_SYNC_BACKEND_ID) await deactivateSyncBackend();
  else await activateSyncBackend(backendId);
}

async function deactivateSyncBackend() {
  const settings = await readSyncDataSettings();
  const values: Record<string, unknown> = {
    [STORAGE_KEYS.activeSyncBackendId]: NO_SYNC_BACKEND_ID,
    [STORAGE_KEYS.syncDataSettings]: DEFAULT_SYNC_DATA_SETTINGS,
  };
  // What the user saw while synced becomes this device's copy.
  const synced = SYNCABLE_DATA_ITEMS.filter(
    (item) => settings[item.preferenceKey],
  );
  if (await isSyncBackendEnabled())
    for (const key of [
      STORAGE_KEYS.language,
      STORAGE_KEYS.preferences,
      ...synced.map((item) => item.dataKey),
    ]) {
      const value = (await readSyncCache(key))?.value;
      if (value !== undefined) values[key] = value;
    }
  await local().set(values);
}

async function activateSyncBackend(backendId: string) {
  const backend = await syncBackendForId(backendId);
  const remoteSettings = await backend.read<SyncDataSettings>(
    STORAGE_KEYS.syncDataSettings,
  );
  const settings = mergeSyncDataSettings(
    remoteSettings ?? (await readSyncDataSettings()),
  );
  const values: Record<string, unknown> = {};
  const staleCaches: string[] = [];
  const failed: string[] = [];
  // Start from what the user sees now, including another backend's caches.
  const current =
    (key: string, preference: SyncPreferenceKey | true, fallback?: unknown) =>
    async () =>
      ((await isSyncRouted(preference))
        ? await readSyncedValue(key)
        : await readLocal(key)()) ?? fallback;
  // An upload failure (e.g. over quota) must not block activation. The value
  // stays pending and visible, and the error shows in the sync status.
  const upload = async (key: string, read: () => Promise<unknown>) => {
    try {
      const { value, merged } = await uploadCurrent(backend, key, read);
      if (merged === undefined) staleCaches.push(syncLocalCacheKey(key));
      else values[syncLocalCacheKey(key)] = flushedCache(merged);
      return value;
    } catch (error) {
      const value = await read();
      if (value === undefined) throw error;
      values[syncLocalCacheKey(key)] = pendingCache(value);
      failed.push(key);
      await recordSyncError(error);
      return value;
    }
  };

  await upload(
    STORAGE_KEYS.language,
    current(
      STORAGE_KEYS.language,
      true,
      getBrowserApi().i18n?.getUILanguage?.() ?? "en-US",
    ),
  );
  const preferences = current(STORAGE_KEYS.preferences, true);
  await upload(STORAGE_KEYS.preferences, async () =>
    mergePreferences(
      ((await preferences()) as Preferences & Record<string, unknown>) ??
        DEFAULT_PREFERENCES,
    ),
  );
  if (remoteSettings === undefined)
    await upload(STORAGE_KEYS.syncDataSettings, async () => settings);
  else
    values[syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)] =
      flushedCache(settings);
  for (const { preferenceKey, dataKey } of SYNCABLE_DATA_ITEMS) {
    const read = current(dataKey, preferenceKey);
    // Upload only what the account syncs: its settings win over this device's.
    const value = settings[preferenceKey]
      ? await upload(dataKey, read)
      : await read();
    if (settings[preferenceKey] === false)
      staleCaches.push(syncLocalCacheKey(dataKey));
    if (value !== undefined) values[dataKey] = value;
  }
  values[STORAGE_KEYS.activeSyncBackendId] = backendId;
  if (staleCaches.length) await local().remove(staleCaches);
  await local().set(values);
  for (const key of failed) queueSyncWrite(backend, key);
}

export async function restoreSyncBackendFromCloud({
  backendId,
  language,
  preferences,
  syncDataSettings,
  data = {},
}: {
  backendId: string;
  language?: string;
  preferences?: Preferences;
  syncDataSettings?: SyncDataSettings;
  data?: Record<string, unknown>;
}) {
  const backend = await syncBackendForId(backendId);
  const values: Record<string, unknown> = {
    [STORAGE_KEYS.activeSyncBackendId]: backendId,
  };
  const alwaysSynced = {
    [STORAGE_KEYS.language]: language,
    [STORAGE_KEYS.preferences]: preferences,
    [STORAGE_KEYS.syncDataSettings]: syncDataSettings,
  };
  // An always-synced value the cloud lacks (a partial upload, say) is uploaded.
  // Published as flushed, every refresh would read the missing document and
  // drop it again, so the account would never get sync settings.
  const missing: string[] = [];
  for (const [key, value] of Object.entries(alwaysSynced))
    if (value !== undefined && (await backend.read(key)) === undefined)
      missing.push(key);
  for (const [key, value] of Object.entries({ ...data, ...alwaysSynced })) {
    if (value === undefined) continue;
    values[key] = value;
    values[syncLocalCacheKey(key)] = missing.includes(key)
      ? pendingCache(value)
      : flushedCache(value);
  }
  await local().set(values);
  for (const key of missing) queueSyncWrite(backend, key);
}

async function syncBackendForId(backendId: string) {
  const backends = await getStoredSyncBackends();
  const backendConfig = backends.find((backend) => backend.id === backendId);
  if (!backendConfig) throw new Error(`Unknown sync backend: ${backendId}`);
  return createSyncBackend(backendConfig);
}

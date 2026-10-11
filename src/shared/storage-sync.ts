import * as config from "./config";
import {
  STORAGE_KEYS,
  SYNCABLE_DATA_ITEMS,
  SYNC_PREFERENCES,
  type SyncDataSettings,
} from "./storage-keys";
import {
  local,
  publishFlushed,
  readSyncCache,
  readSyncDataSettings,
  sameValue,
  writePendingSyncValue,
  type SyncWriteStatus,
} from "./storage-sync-cache";
import {
  isSplitStorageKey,
  markSplitItemsPending,
  materializeSplitItems,
  publishSplitRefresh,
  splitItemIds,
  uploadSplitPending,
} from "./storage-split";
import {
  getActiveSyncBackend,
  getStoredActiveSyncBackendId,
  isSyncBackendEnabled,
  type SyncBackend,
} from "./sync-backends";

export * from "./storage-sync-cache";

async function ownsSyncKey(backendId: string, key: string) {
  if ((await getStoredActiveSyncBackendId()) !== backendId) return false;
  const item = SYNCABLE_DATA_ITEMS.find((item) => item.dataKey === key);
  return !item || (await readSyncDataSettings())[item.preferenceKey];
}

async function uploadPending(backend: SyncBackend, key: string) {
  if (!(await ownsSyncKey(backend.config.id, key))) return;
  const expected = await readSyncCache(key);
  if (!expected || expected.flushedAt !== undefined) return;
  if (isSplitStorageKey(key)) return uploadSplitPending(backend, key, expected);
  const merged = await backend.write(key, expected.value);
  await publishFlushed(key, merged ?? expected.value, expected);
}

// Write queue. Each context debounces its own edits; the flush uploads the
// persisted pending value, so a queue from any context can finish the work.
const queued = new Map<
  string,
  { backend: SyncBackend; timer: ReturnType<typeof setTimeout> }
>();
const flushing = new Map<string, Promise<void>>();
let lastResult: Pick<SyncWriteStatus, "lastFlushedAt" | "lastError"> = {};

function syncWriteDelay(key: string) {
  if (key === STORAGE_KEYS.chats) return config.CHAT_SYNC_WRITE_DEBOUNCE_MS;
  return SYNCABLE_DATA_ITEMS.some((item) => item.dataKey === key)
    ? config.SYNC_WRITE_DEBOUNCE_MS
    : 0; // language, preferences, sync settings
}

export function queueSyncWrite(
  backend: SyncBackend,
  key: string,
  delayMs = syncWriteDelay(key),
) {
  clearTimeout(queued.get(key)?.timer);
  queued.set(key, {
    backend,
    timer: setTimeout(() => void flushSyncWrite(key), delayMs),
  });
  void updateSyncWriteStatus();
}

function flushSyncWrite(key: string): Promise<void> {
  const entry = queued.get(key);
  if (!entry) return flushing.get(key) || Promise.resolve();
  clearTimeout(entry.timer);
  queued.delete(key);
  const run: Promise<void> = (flushing.get(key) || Promise.resolve())
    .then(() => uploadPending(entry.backend, key))
    .then(
      () => {
        lastResult = { lastFlushedAt: Date.now(), lastError: "" };
      },
      (error) => {
        lastResult = { ...lastResult, lastError: errorMessage(error) };
      },
    )
    .finally(() => {
      if (flushing.get(key) === run) flushing.delete(key);
      return updateSyncWriteStatus();
    });
  flushing.set(key, run);
  void updateSyncWriteStatus();
  return run;
}

export async function flushPendingSyncWrites() {
  while (queued.size || flushing.size)
    await Promise.allSettled(
      [...new Set([...queued.keys(), ...flushing.keys()])].map(flushSyncWrite),
    );
}

export function clearPendingSyncWrites() {
  for (const { timer } of queued.values()) clearTimeout(timer);
  queued.clear();
  return updateSyncWriteStatus();
}

export function updateSyncWriteStatus() {
  const keys = new Set([...queued.keys(), ...flushing.keys()]);
  return local()
    .set({
      [STORAGE_KEYS.syncWriteStatus]: {
        pendingCount: keys.size,
        activeCount: flushing.size,
        pendingItems: [...queued].map(([key, { backend }]) => ({
          key,
          operation: "write",
          backendName: backend.config.name,
          backendType: backend.config.type,
        })),
        lastUpdatedAt: Date.now(),
        ...lastResult,
      } satisfies SyncWriteStatus,
    })
    .catch(() => undefined);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function recordSyncError(error: unknown) {
  lastResult = { ...lastResult, lastError: errorMessage(error) };
  return updateSyncWriteStatus();
}

// Remote refresh. A pending edit (possibly left by a closed page) is uploaded
// first; otherwise the remote value replaces the cache if it changed.
async function refreshSyncKey(backend: SyncBackend, key: string) {
  if (!(await ownsSyncKey(backend.config.id, key))) return;
  const expected = await readSyncCache(key);
  if (expected && expected.flushedAt === undefined) {
    queueSyncWrite(backend, key, 0);
    return flushSyncWrite(key);
  }
  const remote = await backend.read(key);
  if (expected ? sameValue(expected.value, remote) : remote === undefined)
    return;
  if (isSplitStorageKey(key))
    return void (await publishSplitRefresh(key, remote, expected));
  const before = await readSyncDataSettings();
  if (!(await publishFlushed(key, remote, expected))) return;
  if (key === STORAGE_KEYS.syncDataSettings)
    await followRemoteSettings(backend, before, await readSyncDataSettings());
}

const remoteRefreshes = new Set<string>();

// Browser sync reports another device's edit as a storage.sync change.
export function refreshChangedSyncKey(key: string) {
  if (remoteRefreshes.has(key)) return;
  remoteRefreshes.add(key);
  getActiveSyncBackend()
    .then((backend) => refreshSyncKey(backend, key))
    .catch(() => undefined)
    .finally(() => remoteRefreshes.delete(key));
}

export async function refreshSyncSettingsFromRemote() {
  if (!(await isSyncBackendEnabled())) return;
  const backend = await getActiveSyncBackend();
  await Promise.all([
    refreshSyncKey(backend, STORAGE_KEYS.language),
    refreshSyncKey(backend, STORAGE_KEYS.preferences),
    refreshSyncKey(backend, STORAGE_KEYS.syncDataSettings),
  ]);
  if ((await readSyncDataSettings())[SYNC_PREFERENCES.providers])
    await refreshSyncKey(backend, STORAGE_KEYS.provider);
}

export async function refreshSyncDataFromRemote() {
  if (!(await isSyncBackendEnabled())) return;
  const backend = await getActiveSyncBackend();
  const settings = await readSyncDataSettings();
  await Promise.all(
    SYNCABLE_DATA_ITEMS.filter(
      (item) =>
        item.dataKey !== STORAGE_KEYS.provider && settings[item.preferenceKey],
    ).map((item) => refreshSyncKey(backend, item.dataKey)),
  );
}

// Another device switched a category. Turning it off keeps the synced value as
// this device's copy; turning it on merges this device's copy into the cloud.
async function followRemoteSettings(
  backend: SyncBackend,
  before: SyncDataSettings,
  after: SyncDataSettings,
) {
  for (const { preferenceKey, dataKey } of SYNCABLE_DATA_ITEMS) {
    if (before[preferenceKey] === after[preferenceKey]) continue;
    if (!after[preferenceKey]) {
      const value = (await readSyncCache(dataKey))?.value;
      if (value === undefined) continue;
      if (isSplitStorageKey(dataKey))
        await materializeSplitItems(backend, dataKey, value);
      await local().set({ [dataKey]: value });
      continue;
    }
    const value = (await local().get(dataKey))[dataKey];
    if (value === undefined) continue;
    await writePendingSyncValue(dataKey, value);
    if (isSplitStorageKey(dataKey))
      await markSplitItemsPending(dataKey, splitItemIds(dataKey, value));
    queueSyncWrite(backend, dataKey);
  }
}

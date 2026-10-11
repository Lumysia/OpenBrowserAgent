import * as config from "./config";
import { getBrowserApi } from "./browser-api";
import { hasUnfinishedChatRun } from "./chats";
import {
  mergeSyncDataSettings,
  STORAGE_KEYS,
  SYNCABLE_DATA_ITEMS,
  SYNC_PREFERENCES,
  type SyncDataSettings,
  type SyncPreferenceKey,
} from "./storage-keys";
import {
  getActiveSyncBackend,
  getStoredActiveSyncBackendId,
  isSyncBackendEnabled,
  type SyncBackend,
} from "./sync-backends";

// While a key is synced, the value the user sees is its local cache entry:
// pending (no flushedAt) until the backend accepted it, then flushed. The plain
// local key is kept as the device's own copy and is never deleted here.
export type SyncLocalCache<T> = {
  value: T;
  updatedAt: number;
  flushedAt?: number;
};

export type SyncWriteStatus = {
  pendingCount: number;
  activeCount?: number;
  pendingItems?: Array<{
    key: string;
    operation: "write" | "remove";
    backendName: string;
    backendType: SyncBackend["config"]["type"];
  }>;
  lastUpdatedAt?: number;
  lastFlushedAt?: number;
  lastError?: string;
};

export const DEFAULT_SYNC_WRITE_STATUS: SyncWriteStatus = { pendingCount: 0 };

export const local = () => getBrowserApi().storage.local;
export const sameValue = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
export const pendingCache = (value: unknown) => ({
  value,
  updatedAt: Date.now(),
});
export const flushedCache = (value: unknown) => ({
  ...pendingCache(value),
  flushedAt: Date.now(),
});

const lockQueues = new Map<string, Promise<unknown>>();

// Web Locks serialize the extension pages and the background; the fallback
// serializes callers within one context.
export function withLock<T>(name: string, operation: () => Promise<T>) {
  const lockName = `openbrowseragent:${name}`;
  if (globalThis.navigator?.locks)
    return navigator.locks.request(lockName, operation) as Promise<T>;
  const next = (lockQueues.get(lockName) || Promise.resolve())
    .catch(() => undefined)
    .then(operation);
  lockQueues.set(lockName, next);
  return next;
}

export function syncLocalCacheKey(key: string) {
  return `${key}:sync-local-cache`;
}

export async function readSyncCache<T>(key: string) {
  const cacheKey = syncLocalCacheKey(key);
  return (await local().get(cacheKey))[cacheKey] as
    SyncLocalCache<T> | undefined;
}

export function writePendingSyncValue<T>(key: string, value: T) {
  return withLock(syncLocalCacheKey(key), () =>
    local().set({ [syncLocalCacheKey(key)]: pendingCache(value) }),
  );
}

// Publish a backend result only if the cache entry is still the one the caller
// read. A flush or refresh must never overwrite a newer pending edit.
async function publishFlushed(
  key: string,
  value: unknown,
  expected: SyncLocalCache<unknown> | undefined,
) {
  return withLock(syncLocalCacheKey(key), async () => {
    const current = await readSyncCache(key);
    if (!sameValue(current, expected)) return false;
    if (value === undefined) await local().remove(syncLocalCacheKey(key));
    else if (
      current?.flushedAt === undefined ||
      !sameValue(current.value, value)
    )
      await local().set({ [syncLocalCacheKey(key)]: flushedCache(value) });
    return true;
  });
}

// Synced value with the device's local copy as fallback.
export async function readSyncedValue<T>(key: string) {
  if (await isSyncBackendEnabled()) {
    const cached = (await readSyncCache<T>(key))?.value;
    if (cached !== undefined) return cached;
  }
  return (await local().get(key))[key] as T | undefined;
}

export async function readSyncDataSettings() {
  return mergeSyncDataSettings(
    await readSyncedValue<SyncDataSettings>(STORAGE_KEYS.syncDataSettings),
  );
}

// `true` routes an always-synced key (language, preferences, settings).
export async function isSyncRouted(preference: SyncPreferenceKey | true) {
  if (!(await isSyncBackendEnabled())) return false;
  return preference === true || (await readSyncDataSettings())[preference];
}

async function ownsSyncKey(backendId: string, key: string) {
  if ((await getStoredActiveSyncBackendId()) !== backendId) return false;
  const item = SYNCABLE_DATA_ITEMS.find((item) => item.dataKey === key);
  return !item || (await readSyncDataSettings())[item.preferenceKey];
}

async function uploadPending(backend: SyncBackend, key: string) {
  if (!(await ownsSyncKey(backend.config.id, key))) return;
  const expected = await readSyncCache(key);
  if (!expected || expected.flushedAt !== undefined) return;
  if (key === STORAGE_KEYS.chats && hasUnfinishedChatRun(expected.value))
    return;
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
      if (value !== undefined) await local().set({ [dataKey]: value });
      continue;
    }
    const value = (await local().get(dataKey))[dataKey];
    if (value === undefined) continue;
    await writePendingSyncValue(dataKey, value);
    queueSyncWrite(backend, dataKey);
  }
}

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
import type { Preferences } from "./types";

export async function refreshSyncFromRemote(
  currentPreferences: Preferences,
): Promise<void> {
  if (!(await isSyncBackendEnabled())) return;
  const backend = await getActiveSyncBackend();
  await refreshSyncKey(backend, STORAGE_KEYS.language);
  const syncedPreferences = await refreshSyncKey<Preferences>(
    backend,
    STORAGE_KEYS.preferences,
    mergePreferences,
  );
  const preferences = syncedPreferences || currentPreferences;

  await Promise.all(
    SYNCABLE_DATA_ITEMS.filter(
      (item) => preferences[item.preferenceKey] === true,
    ).map((item) => refreshSyncKey(backend, item.dataKey)),
  );
}

async function refreshSyncKey<T>(
  backend: SyncBackend,
  key: string,
  normalize?: (value: T) => T,
) {
  const pending = await readPendingSyncValue<T>(key);
  if (pending !== undefined) {
    if (key === STORAGE_KEYS.chats && hasUnfinishedChatRun(pending))
      return pending;
    const value = normalize ? normalize(pending) : pending;
    await backend.write(key, value);
    await markSyncLocalCacheFlushed(key, value);
    return value;
  }

  const previous = await readSyncLocalValue<T>(key);
  const remote = await backend.read<T>(key);
  if (remote === undefined) return undefined;
  const value = normalize ? normalize(remote) : remote;
  await markSyncLocalCacheFlushed(key, value);
  if (previous !== undefined && !sameStorageValue(previous, value))
    await backend.write(key, value);
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

import { getBrowserApi } from "./browser-api";
import { STORAGE_KEYS, SYNCABLE_DATA_ITEMS } from "./storage-keys";
import {
  markSyncLocalCacheFlushed,
  readSyncLocalCache,
} from "./storage-sync-local";
import {
  NO_SYNC_BACKEND_ID,
  getActiveSyncBackend,
  isSyncBackendEnabled,
} from "./sync-backends";
import { mergeSyncDataSettings } from "./sync-data-settings";
import { hasUnfinishedChatRun } from "./chats";

// Call while holding sync ownership, before touching a backend. Routing can no
// longer transition during the remote operation, but ordinary local edits can.
export async function ownsSyncKey(backendId: string, key: string) {
  const local = getBrowserApi().storage.local;
  const active =
    (await local.get(STORAGE_KEYS.activeSyncBackendId))[
      STORAGE_KEYS.activeSyncBackendId
    ] || NO_SYNC_BACKEND_ID;
  if (active === NO_SYNC_BACKEND_ID || active !== backendId) return false;
  const item = SYNCABLE_DATA_ITEMS.find((item) => item.dataKey === key);
  if (!item) return true;
  const settings =
    (await readSyncLocalCache(STORAGE_KEYS.syncDataSettings))?.value ??
    (await local.get(STORAGE_KEYS.syncDataSettings))[
      STORAGE_KEYS.syncDataSettings
    ];
  return mergeSyncDataSettings(
    settings as Parameters<typeof mergeSyncDataSettings>[0],
  )[item.preferenceKey];
}

// A transition adopts persisted intents from every extension context, including
// ones whose debounce queue has not run yet. No network wait holds local locks.
// Otherwise a staged deletion could be merged back from the outgoing backend.
export async function settleSyncWrites() {
  if (!(await isSyncBackendEnabled())) return;
  const backend = await getActiveSyncBackend();
  for (const key of [
    STORAGE_KEYS.syncDataSettings,
    STORAGE_KEYS.language,
    STORAGE_KEYS.preferences,
    ...SYNCABLE_DATA_ITEMS.map((item) => item.dataKey),
  ]) {
    while (await ownsSyncKey(backend.config.id, key)) {
      const expected = await readSyncLocalCache(key);
      if (!expected || expected.flushedAt !== undefined) break;
      if (key === STORAGE_KEYS.chats && hasUnfinishedChatRun(expected.value))
        break;
      let value;
      if (expected.removed) await backend.remove(key);
      else value = (await backend.write(key, expected.value)) ?? expected.value;
      await markSyncLocalCacheFlushed(key, value, {
        expected,
        backendId: backend.config.id,
      });
    }
  }
}

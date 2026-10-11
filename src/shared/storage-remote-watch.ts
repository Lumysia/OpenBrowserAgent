import { getBrowserApi } from "./browser-api";
import { STORAGE_AREAS } from "./storage-areas";
import { STORAGE_KEYS } from "./storage-keys";
import { getActiveSyncBackend, SYNC_BACKEND_TYPES } from "./sync-backends";

// Browser sync reports remote edits as storage.sync changes. Read the document
// through the backend so the change is merged into this device's replica.
export function watchRemoteValue<T>(
  key: string,
  callback: (change: { newValue?: T; oldValue?: T }, backendId: string) => void,
) {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    changedArea: string,
  ) => {
    if (changedArea !== STORAGE_AREAS.sync || !changes[key]) return;
    getActiveSyncBackend()
      .then(async (backend) => {
        if (backend.config.type !== SYNC_BACKEND_TYPES.browserSync) return;
        callback({ newValue: await backend.read<T>(key) }, backend.config.id);
      })
      .catch(() => undefined);
  };
  getBrowserApi().storage.onChanged.addListener(listener);
  return () => getBrowserApi().storage.onChanged.removeListener(listener);
}

export function isBackendStorageChange(key: string, changedArea: string) {
  return (
    changedArea === STORAGE_AREAS.sync && key !== STORAGE_KEYS.syncWriteStatus
  );
}

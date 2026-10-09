import { getBrowserApi } from "./browser-api";
import { STORAGE_AREAS } from "./storage-areas";
import { STORAGE_KEYS } from "./storage-keys";
import {
  getActiveSyncBackend,
  type RemoteStorageChange,
} from "./sync-backends";

export function watchRemoteValue<T>(
  key: string,
  callback: (change: RemoteStorageChange<T>, backendId: string) => void,
) {
  let remoteUnwatch: (() => void) | undefined;
  let disposed = false;
  let generation = 0;

  async function setupRemoteWatch() {
    const currentGeneration = ++generation;
    remoteUnwatch?.();
    remoteUnwatch = undefined;
    const backend = await getActiveSyncBackend();
    if (!disposed && generation === currentGeneration)
      remoteUnwatch = backend.watch?.(key, (change) => {
        if (!disposed && generation === currentGeneration)
          callback(change as RemoteStorageChange<T>, backend.config.id);
      });
  }

  setupRemoteWatch().catch(() => undefined);
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    changedArea: string,
  ) => {
    if (
      changedArea !== STORAGE_AREAS.local ||
      (!changes[STORAGE_KEYS.activeSyncBackendId] &&
        !changes[STORAGE_KEYS.syncBackends])
    )
      return;
    setupRemoteWatch().catch(() => undefined);
  };
  getBrowserApi().storage.onChanged.addListener(listener);

  return () => {
    disposed = true;
    remoteUnwatch?.();
    getBrowserApi().storage.onChanged.removeListener(listener);
  };
}

export function isBackendStorageChange(key: string, changedArea: string) {
  return (
    changedArea === STORAGE_AREAS.sync && key !== STORAGE_KEYS.syncWriteStatus
  );
}

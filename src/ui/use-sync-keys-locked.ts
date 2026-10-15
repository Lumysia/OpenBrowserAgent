import { storage } from "../shared/storage";
import { NO_SYNC_BACKEND_ID } from "../shared/sync-backends";
import { syncKeysLocked } from "../shared/sync-keys-lock";
import { useStoredState } from "./useStoredState";

// Whether this device's synced API keys wait for the sync passphrase.
export function useSyncKeysLocked() {
  const [status] = useStoredState(storage.syncStatus);
  const [activeBackendId] = useStoredState(storage.activeSyncBackendId);
  return syncKeysLocked(
    status,
    !!activeBackendId && activeBackendId !== NO_SYNC_BACKEND_ID,
  );
}

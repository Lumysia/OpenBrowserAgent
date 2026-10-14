import { storage } from "../shared/storage";
import { syncBackendCapabilities } from "../shared/sync-backends";
import { enabledCollections } from "../shared/sync/collections";
import { useStoredState } from "./useStoredState";

// Whether sync is on and leaves out the collection `name` on this device
// (its group is off, or the backend has no room for it), so its content
// here may not be the whole of it.
export function useNotSyncedHere(name: string) {
  const [activeId] = useStoredState(storage.activeSyncBackendId);
  const [backends] = useStoredState(storage.syncBackends);
  const [groups] = useStoredState(storage.syncGroups);
  const backend = backends?.find((item) => item.id === activeId);
  if (!backend || !groups) return false;
  return !enabledCollections(
    groups,
    syncBackendCapabilities(backend.type),
  ).some((collection) => collection.name === name);
}

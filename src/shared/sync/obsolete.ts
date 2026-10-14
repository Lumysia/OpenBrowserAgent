import { STORAGE_KEYS } from "../storage-keys";
import { SYNC_COLLECTIONS } from "./collections";
import { readKey, type StorageArea } from "./env";
import { ROOT_FORMAT } from "./root";

// Local sync data an earlier sync format left behind, removed once per
// format: the old sync settings, the clocks and merge bases of collections
// that no longer sync (local execution bridges), and the caches of roots in
// the old format. Local user data (providers, agents, chats, …) stays, and
// so do the clocks of collections that still sync.
const REMOVED_KEYS = ["sync-data-settings"];
const PER_COLLECTION = [STORAGE_KEYS.syncClocks, STORAGE_KEYS.syncBases];

export async function cleanUpOldSyncData(local: StorageArea) {
  if ((await readKey(local, STORAGE_KEYS.syncFormat)) === ROOT_FORMAT) return;
  const names = new Set(SYNC_COLLECTIONS.map((collection) => collection.name));
  const stale = Object.keys(await local.get(null)).filter((key) => {
    if (REMOVED_KEYS.includes(key)) return true;
    if (key.startsWith(`${STORAGE_KEYS.syncState}:`)) return true;
    const prefix = PER_COLLECTION.find((name) => key.startsWith(`${name}:`));
    return !!prefix && !names.has(key.slice(prefix.length + 1).split(":")[0]);
  });
  if (stale.length) await local.remove(stale);
  await local.set({ [STORAGE_KEYS.syncFormat]: ROOT_FORMAT });
}

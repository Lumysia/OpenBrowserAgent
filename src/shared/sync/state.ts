import { STORAGE_KEYS } from "../storage-keys";
import { storageLockName } from "../locks";
import { readKey, type StorageArea, type SyncEnv } from "./env";
import { INITIAL_HLC, type HlcState } from "./hlc";
import type { SyncedEntry } from "./plan";
import type { Root, SyncRecord } from "./root";
import { SYNC_COLLECTIONS } from "./collections";

// What a device keeps between rounds, in storage.local so a background
// restart neither downloads everything again nor forgets local changes.
export type SyncState = {
  // The backend this state belongs to; another backend starts over.
  scope: string;
  // The last root read or written, with its validator.
  remote?: { root: Root; etag?: string };
  // Per record: the version this device's copy matches.
  synced: Record<string, SyncedEntry>;
  // Local changes stamped but not yet in the remote root.
  pending: Record<string, SyncRecord>;
  hlc: HlcState;
  // Collections to compare in full next round (sync just turned on).
  rescan: string[];
  lastSweepAt?: number;
};

export const SYNC_WARNINGS = {
  // PUT with If-Match keeps failing on an unchanged file, or the server
  // gives no strong ETag: writes are unsafe and stopped.
  unreliableEtags: "unreliable-etags",
  // The server accepted a write whose precondition should have failed.
  ignoresPreconditions: "ignores-preconditions",
  // Another device wrote a newer format; this one stops until updated.
  newerFormat: "newer-format",
  // A record's content is missing on the server.
  missingContent: "missing-content",
  // The browser account's sync storage is full.
  quota: "quota",
} as const;

export type SyncWarning = (typeof SYNC_WARNINGS)[keyof typeof SYNC_WARNINGS];

export type MassDelete = { collection: string; count: number; total: number };

export type SyncStatus = {
  running?: boolean;
  lastSyncAt?: number;
  lastCheckAt?: number;
  pausedUntil?: number;
  // HTTP status that paused sync (429 or 503).
  pauseStatus?: number;
  pendingCount: number;
  error?: string;
  warnings: SyncWarning[];
  // Deletions waiting for the user's answer.
  massDelete?: MassDelete[];
  // Consecutive rate-limit pauses, for the doubling backoff.
  backoffLevel?: number;
};

export const DEFAULT_SYNC_STATUS: SyncStatus = {
  pendingCount: 0,
  warnings: [],
};

export const newSyncState = (scope: string): SyncState => ({
  scope,
  synced: {},
  pending: {},
  hlc: INITIAL_HLC,
  // A new backend compares everything.
  rescan: SYNC_COLLECTIONS.map((collection) => collection.name),
});

export async function loadSyncState(local: StorageArea, scope: string) {
  const stored = await readKey<SyncState>(local, STORAGE_KEYS.syncState);
  return stored?.scope === scope ? stored : newSyncState(scope);
}

export const saveSyncState = (local: StorageArea, state: SyncState) =>
  local.set({ [STORAGE_KEYS.syncState]: state });

export async function loadSyncStatus(local: StorageArea) {
  return {
    ...DEFAULT_SYNC_STATUS,
    ...(await readKey<SyncStatus>(local, STORAGE_KEYS.syncStatus)),
  };
}

export async function updateSyncStatus(
  local: StorageArea,
  patch: Partial<SyncStatus>,
) {
  const next = { ...(await loadSyncStatus(local)), ...patch };
  for (const [key, value] of Object.entries(patch))
    if (value === undefined) delete next[key as keyof SyncStatus];
  await local.set({ [STORAGE_KEYS.syncStatus]: next });
  return next;
}

// Storage keys changed since a round last compared them: how many changes
// were seen, so a round clears a key only if no change came in while it
// ran, and when the latest change was seen.
export type DirtyKey = { changes: number; at: number };
export type DirtyKeys = Record<string, DirtyKey>;

const DIRTY_LOCK = storageLockName(STORAGE_KEYS.syncDirty);

export async function loadDirty(local: StorageArea): Promise<DirtyKeys> {
  return (await readKey<DirtyKeys>(local, STORAGE_KEYS.syncDirty)) ?? {};
}

// Record changes of local keys. Resolves whether a key became dirty.
export function markDirty(env: SyncEnv, keys: string[]) {
  return env.lock(DIRTY_LOCK, async () => {
    const dirty = await loadDirty(env.local);
    const now = env.now();
    const fresh = keys.some((key) => !dirty[key]);
    for (const key of keys)
      dirty[key] = {
        changes: (dirty[key]?.changes ?? 0) + 1,
        at: Math.max(now, dirty[key]?.at ?? 0),
      };
    await env.local.set({ [STORAGE_KEYS.syncDirty]: dirty });
    return fresh;
  });
}

// Remove keys a round compared, unless they changed again meanwhile.
export async function clearDirty(
  env: SyncEnv,
  seen: DirtyKeys,
  keys: string[],
) {
  if (!keys.length) return;
  await env.lock(DIRTY_LOCK, async () => {
    const current = await loadDirty(env.local);
    for (const key of keys)
      if (current[key]?.changes === seen[key]?.changes) delete current[key];
    await env.local.set({ [STORAGE_KEYS.syncDirty]: current });
  });
}

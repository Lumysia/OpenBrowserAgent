import { STORAGE_KEYS } from "../storage-keys";
import { readKey, type StorageArea } from "./env";
import type { Root, SyncRecord } from "./root";

// What a device keeps per backend between rounds, in storage.local. Only
// caches: what local data holds and when it changed is recorded per record
// (clocks.ts), so losing this state never deletes or re-sends anything.
export type SyncState = {
  // The backend this state belongs to.
  scope: string;
  // The last root read or written, with its validator.
  remote?: { root: Root; etag?: string };
  // Blobs this device uploaded that another device may have been collecting
  // at that moment (they were garbage in a root seen before), with when:
  // checked in later rounds and uploaded again if they went missing.
  uploads?: Record<string, number>;
  lastSweepAt?: number;
  // The last root write this device made, until a later read shows whether
  // the root still descends from it: its id and the records it pushed. A
  // write the server accepted is not yet a confirmation (a server that
  // ignores If-Match lets another device's write replace it).
  sent?: { write: string; records: Record<string, SyncRecord> };
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

// A round that would delete most of a collection: remote deletions applied
// here, or (`local`) deletions made here sent to every device.
export type MassDelete = {
  collection: string;
  count: number;
  total: number;
  local?: true;
  // The user's answer, while a prompt of the other kind is still open.
  keep?: boolean;
};

// The user's answer for collections the guard stopped at: apply the
// deletions, or keep the items (this device's copies upload again; items
// deleted here come back from the remote copy). `local`: the answer is for
// that kind of prompt only (unset: for both).
export type MassDeleteAnswer = {
  collections: string[];
  keep: boolean;
  local?: boolean;
};

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

export const newSyncState = (scope: string): SyncState => ({ scope });

const stateKey = (scope: string) => `${STORAGE_KEYS.syncState}:${scope}`;

export async function loadSyncState(local: StorageArea, scope: string) {
  const stored = await readKey<SyncState>(local, stateKey(scope));
  return stored?.scope === scope ? stored : newSyncState(scope);
}

export const saveSyncState = (local: StorageArea, state: SyncState) =>
  local.set({ [stateKey(state.scope)]: state });

// Forget the caches of backends no longer configured.
export async function pruneSyncStates(local: StorageArea, keep: string[]) {
  const kept = new Set(keep.map(stateKey));
  const stale = Object.keys(await local.get(null)).filter(
    (key) => key.startsWith(`${STORAGE_KEYS.syncState}:`) && !kept.has(key),
  );
  if (stale.length) await local.remove(stale);
}

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

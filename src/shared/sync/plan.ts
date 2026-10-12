import { compareClocks, type Clock } from "./hlc";
import type { SyncRecord } from "./root";

// What this device's copy of a record last matched: the record's clock, a
// hash of its data and its blob. Local and remote changes are both measured
// against it.
export type SyncedEntry = {
  clock: Clock;
  deleted?: true;
  dataHash?: string;
  blob?: string;
};

// Content to merge when both sides changed a record's blob.
export type BlobMerge = { base?: string; mine: string; theirs: string };

export type Decision =
  | { kind: "none" }
  // The remote root already holds this device's pending record.
  | { kind: "accept" }
  | { kind: "push"; record: SyncRecord }
  // The remote record wins; local pending changes of it are dropped.
  | { kind: "apply"; record: SyncRecord }
  // Both sides changed it: data and blob are taken per field, and blobs both
  // changed are merged by the collection (chat messages, conflict copies).
  | {
      kind: "merge";
      data: unknown;
      blob?: string | BlobMerge;
      size?: number;
    };

export type DecisionInput = {
  synced?: SyncedEntry;
  // This device's stamped change not yet in the remote root.
  pending?: SyncRecord;
  remote?: SyncRecord;
  // The collection merges concurrent blob changes instead of picking one.
  mergesContent: boolean;
  dataHash: (data: unknown) => Promise<string>;
  // The local record, for re-uploading what the remote root lost.
  local?: SyncRecord;
};

export async function decide({
  synced,
  pending,
  remote,
  mergesContent,
  dataHash,
  local,
}: DecisionInput): Promise<Decision> {
  if (pending) {
    if (!remote)
      return pending.deleted && !synced ? { kind: "none" } : push(pending);
    if (remote.clock === pending.clock) return { kind: "accept" };
    if (synced && remote.clock === synced.clock) return push(pending);
    return conflict({ synced, pending, remote, mergesContent, dataHash });
  }
  // Remote lost the record, or went back to an older copy (a server that
  // ignored If-Match let another write replace this device's, a server
  // restored from a backup, cloud data cleared): never a delete, upload this
  // device's copy again. A delete that was lost is sent again too.
  const remoteBehind =
    !!synced && (!remote || compareClocks(remote.clock, synced.clock) < 0);
  if (remoteBehind && !synced.deleted && local) return push(local);
  if (remoteBehind && synced.deleted && remote)
    return push({ clock: synced.clock, deleted: true });
  if (!remote || remote.clock === synced?.clock) return { kind: "none" };
  return { kind: "apply", record: remote };
}

const push = (record: SyncRecord): Decision => ({ kind: "push", record });

async function conflict({
  synced,
  pending,
  remote,
  mergesContent,
  dataHash,
}: Required<Pick<DecisionInput, "pending" | "remote">> &
  Omit<DecisionInput, "pending" | "remote" | "local">): Promise<Decision> {
  const mineNewer = compareClocks(pending.clock, remote.clock) > 0;
  // A device that never synced this record joins the account: the remote
  // copy wins, except content that merges without loss.
  if (!synced) {
    if (pending.deleted || remote.deleted)
      return { kind: "apply", record: remote };
    if (
      !mergesContent ||
      !pending.blob ||
      !remote.blob ||
      pending.blob === remote.blob
    )
      return { kind: "apply", record: remote };
    return mergeDecision(remote.data, {
      mine: pending.blob,
      theirs: remote.blob,
    });
  }
  // A delete against an edit: the newer one wins.
  if (pending.deleted || remote.deleted)
    return mineNewer ? push(pending) : { kind: "apply", record: remote };

  const [mineData, theirsData] = await Promise.all([
    dataHash(pending.data),
    dataHash(remote.data),
  ]);
  const mineDataChanged = mineData !== synced.dataHash;
  const theirsDataChanged = theirsData !== synced.dataHash;
  const data =
    mineDataChanged && (!theirsDataChanged || mineNewer)
      ? pending.data
      : remote.data;

  const mineBlobChanged = pending.blob !== synced.blob;
  const theirsBlobChanged = remote.blob !== synced.blob;
  let blob: string | BlobMerge | undefined;
  let size: number | undefined;
  if (!mineBlobChanged || pending.blob === remote.blob || !theirsBlobChanged) {
    const mine = mineBlobChanged && !theirsBlobChanged;
    blob = mine ? pending.blob : remote.blob;
    size = mine ? pending.size : remote.size;
  } else if (mergesContent && pending.blob && remote.blob)
    blob = { base: synced.blob, mine: pending.blob, theirs: remote.blob };
  else {
    blob = mineNewer ? pending.blob : remote.blob;
    size = mineNewer ? pending.size : remote.size;
  }

  if (blob === remote.blob && data === remote.data)
    return { kind: "apply", record: remote };
  if (blob === pending.blob && data === pending.data && mineNewer)
    return push(pending);
  return { kind: "merge", data, blob, size };
}

function mergeDecision(data: unknown, blob: BlobMerge): Decision {
  return { kind: "merge", data, blob };
}

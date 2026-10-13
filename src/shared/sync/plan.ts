import type { Version } from "./clocks";
import { compareClocks } from "./hlc";
import type { SyncRecord } from "./root";

// Deciding one record: this device's copy with its clock against the
// remote record. The newer clock wins; when both sides changed the record
// since the version this device's change was made from, data and blob are
// taken per field and blobs both changed are merged.

// Content to merge when both sides changed a record's blob.
export type BlobMerge = { base?: string; mine: string; theirs: string };

export type Side = "mine" | "theirs";

export type Decision =
  | { kind: "none" }
  // The remote root holds this device's change.
  | { kind: "accept" }
  | { kind: "push"; record: SyncRecord }
  | { kind: "apply"; record: SyncRecord }
  | {
      kind: "merge";
      data: unknown;
      blob?: string | BlobMerge;
      size?: number;
      newer: Side;
    };

export type DecisionInput = {
  // This device's copy as a record; undefined when it has neither a copy
  // nor a clock for it.
  local?: SyncRecord;
  // The copy has no clock (never changed since changes were recorded):
  // `local.clock` is the unknown-age clock and loses to any other.
  untracked?: boolean;
  // The copy is a change made here that no backend confirmed yet, made
  // from `base` (undefined: made without knowing any remote version).
  changedHere?: boolean;
  base?: Version;
  remote?: SyncRecord;
  // The collection merges concurrent blob changes instead of picking one.
  mergesContent: boolean;
  secrets?: string[];
  dataHash: (data: unknown) => Promise<string>;
};

const NONE: Decision = { kind: "none" };
const push = (record: SyncRecord): Decision => ({ kind: "push", record });
const apply = (record: SyncRecord): Decision => ({ kind: "apply", record });

export async function decide(input: DecisionInput): Promise<Decision> {
  const { local, remote } = input;
  if (!local) return remote ? apply(remote) : NONE;
  // Missing remotely (a new record, the server lost it, another backend):
  // never a delete. A delete the remote never had needs no record.
  if (!remote) return local.deleted ? NONE : push(local);
  if (input.untracked) return conflict(input, local, remote, undefined, false);
  if (local.clock === remote.clock)
    return input.changedHere ? { kind: "accept" } : NONE;
  const mineNewer = compareClocks(local.clock, remote.clock) > 0;
  if (!input.changedHere) return mineNewer ? push(local) : apply(remote);
  if (mineNewer && input.base?.clock === remote.clock) return push(local);
  return conflict(input, local, remote, input.base, mineNewer);
}

// Both sides changed the record since `base` (undefined: they never shared
// a version, so every difference is a change on both sides).
async function conflict(
  { mergesContent, dataHash, secrets }: DecisionInput,
  mine: SyncRecord,
  theirs: SyncRecord,
  base: Version | undefined,
  mineNewer: boolean,
): Promise<Decision> {
  // A delete against an edit: the newer one wins.
  if (mine.deleted || theirs.deleted)
    return mineNewer ? push(mine) : apply(theirs);

  const [mineData, theirsData] = await Promise.all([
    dataHash(mine.data),
    dataHash(theirs.data),
  ]);
  // Both hold the same content.
  if (mineData === theirsData && mine.blob === theirs.blob)
    return apply(theirs);
  const mineDataChanged = mineData !== base?.dataHash;
  const theirsDataChanged = theirsData !== base?.dataHash;
  const mineWins = mineDataChanged && (!theirsDataChanged || mineNewer);
  let data = mineWins ? mine.data : theirs.data;
  if (!base)
    data = keepSecrets(data, mineWins ? theirs.data : mine.data, secrets);

  const mineBlobChanged = mine.blob !== base?.blob;
  const theirsBlobChanged = theirs.blob !== base?.blob;
  let blob: string | BlobMerge | undefined;
  let size: number | undefined;
  if (!mineBlobChanged || mine.blob === theirs.blob || !theirsBlobChanged) {
    const takeMine = mineBlobChanged && !theirsBlobChanged;
    blob = takeMine ? mine.blob : theirs.blob;
    size = takeMine ? mine.size : theirs.size;
  } else if (mergesContent && mine.blob && theirs.blob)
    blob = { base: base?.blob, mine: mine.blob, theirs: theirs.blob };
  else {
    blob = mineNewer ? mine.blob : theirs.blob;
    size = mineNewer ? mine.size : theirs.size;
  }

  if (blob === theirs.blob && data === theirs.data) return apply(theirs);
  if (blob === mine.blob && data === mine.data && mineNewer) return push(mine);
  return {
    kind: "merge",
    data,
    blob,
    size,
    newer: mineNewer ? "mine" : "theirs",
  };
}

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (typeof value === "object" && !Object.keys(value).length);

// Secrets of the losing side fill the winner's empty ones (a provider form
// opened on a new device before joining stores an empty API key).
export function keepSecrets(
  winner: unknown,
  loser: unknown,
  secrets: string[] | undefined,
) {
  if (!secrets?.length || !isRecord(winner) || !isRecord(loser)) return winner;
  const kept = secrets.filter(
    (field) => isEmpty(winner[field]) && !isEmpty(loser[field]),
  );
  if (!kept.length) return winner;
  return {
    ...winner,
    ...Object.fromEntries(kept.map((field) => [field, loser[field]])),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

import { bytesText, sha256Hex } from "./codec";
import type { Collection } from "./collection";
import { recordIdOf } from "./collections";
import type { SyncEnv } from "./env";
import { bodyBytes, idsWithPrefix, type Payloads } from "./local";
import { referencedBlobs, type Root, type SyncRecord } from "./root";
import type { SyncState } from "./state";
import type { StoredBlob, Transport } from "./transport";

// Blob handling of a round: reading bodies, building the next root with its
// garbage list, and collecting garbage.

export const GARBAGE_GRACE_MS = 24 * 60 * 60_000;
export const ORPHAN_SWEEP_INTERVAL_MS = 7 * 24 * 60 * 60_000;
// How long a device keeps checking a blob it uploaded while another device
// may have been collecting it: far longer than a round's deletions take.
const UPLOAD_CHECK_MS = 10 * 60_000;

export function parseBody(collection: Collection, payload: Uint8Array) {
  return collection.body === "bytes" ? payload : JSON.parse(bytesText(payload));
}

// A body by hash: seen locally this round, else downloaded (and checked).
// Undefined when the server does not have it.
export async function bodyFor(
  transport: Transport,
  collection: Collection,
  hash: string,
  payloads: Payloads,
) {
  let payload = payloads.get(hash);
  if (!payload) {
    payload = await transport.getBlob(hash);
    if (!payload) return undefined;
    payloads.set(hash, payload);
  }
  return { body: parseBody(collection, payload) };
}

// The next root: `base` with `pushes` replacing their records. Blobs that
// replaced records referred to go to the garbage list; blobs referred to
// again leave it.
export function nextRoot(
  base: Root,
  writer: string,
  pushes: Map<string, SyncRecord>,
  now: number,
): Root {
  const records = { ...base.records };
  const garbage = new Map(base.garbage.map((entry) => [entry.blob, entry]));
  for (const [recordId, record] of pushes) {
    const old = records[recordId]?.blob;
    records[recordId] = record;
    if (old && old !== record.blob && !garbage.has(old))
      garbage.set(old, { blob: old, since: now });
  }
  const root: Root = {
    ...base,
    writer,
    records,
    garbage: [],
  };
  const used = referencedBlobs(root);
  root.garbage = [...garbage.values()].filter((entry) => !used.has(entry.blob));
  return root;
}

// Blobs the server holds according to a root: the ones its records refer
// to, and garbage not yet collected (collection drops a blob from the root
// before deleting it).
export function storedBlobs(root: Root) {
  const blobs = referencedBlobs(root);
  for (const entry of root.garbage) blobs.add(entry.blob);
  return blobs;
}

// Upload the blobs the pushes need that the server does not hold. Pushes
// never refer to a blob this device cannot provide (see the engine).
// Returns the blobs uploaded.
export async function uploadBlobs(
  transport: Transport,
  remote: Root,
  pushes: Map<string, SyncRecord>,
  payloads: Payloads,
) {
  const present = storedBlobs(remote);
  const uploads = new Set<string>();
  for (const record of pushes.values())
    if (record.blob && !present.has(record.blob) && payloads.has(record.blob))
      uploads.add(record.blob);
  for (const hash of uploads)
    await transport.putBlob(hash, payloads.get(hash)!);
  return uploads;
}

// Drop garbage older than the grace period (nobody refers to it any more)
// from the root about to be written; returns the blobs to delete once that
// root is written. Deleting first would remove blobs a concurrent writer,
// whose root then wins, may refer to again.
export function dropExpiredGarbage(root: Root, now: number) {
  const used = referencedBlobs(root);
  const expired = root.garbage
    .filter(
      (entry) => now - entry.since >= GARBAGE_GRACE_MS && !used.has(entry.blob),
    )
    .map((entry) => entry.blob);
  root.garbage = root.garbage.filter((entry) => !expired.includes(entry.blob));
  return expired;
}

// Delete collected blobs. One that fails stays behind as an orphan for the
// weekly sweep.
export async function deleteBlobs(transport: Transport, blobs: string[]) {
  for (const blob of blobs)
    await transport.deleteBlob(blob).catch(() => undefined);
}

// Blobs on the server that no record and no garbage entry names, older than
// the grace period: left by rounds that uploaded and then failed.
export async function sweepOrphans(
  transport: Transport,
  root: Root,
  stored: StoredBlob[],
  now: number,
) {
  const known = storedBlobs(root);
  let removed = 0;
  for (const blob of stored) {
    if (
      known.has(blob.hash) ||
      !blob.modifiedAt ||
      now - blob.modifiedAt < GARBAGE_GRACE_MS
    )
      continue;
    await transport.deleteBlob(blob.hash);
    removed++;
  }
  return removed;
}

// Bodies this device holds of blobs the root refers to, by hash.
async function heldBodies(
  env: SyncEnv,
  collections: Collection[],
  root: Root,
  hashes: Set<string>,
) {
  const held = new Map<string, Uint8Array>();
  for (const collection of collections) {
    if (!collection.body) continue;
    const wanted = new Map<string, string>();
    for (const id of idsWithPrefix(root.records, collection)) {
      const blob = root.records[recordIdOf(collection, id)].blob;
      if (blob && hashes.has(blob) && !held.has(blob)) wanted.set(id, blob);
    }
    if (!wanted.size) continue;
    const entries = await collection.read(env, (id) => wanted.has(id));
    for (const [id, blob] of wanted) {
      const entry = entries.get(id);
      if (entry?.body === undefined) continue;
      const bytes = bodyBytes(collection, entry.body);
      if ((await sha256Hex(bytes)) === blob) held.set(blob, bytes);
    }
  }
  return held;
}

// Blobs the root refers to that the server lost (a folder restored without
// its blobs, files removed by hand): this device uploads the ones it holds.
export async function restoreLostBlobs(
  env: SyncEnv,
  transport: Transport,
  collections: Collection[],
  root: Root,
  stored: StoredBlob[],
) {
  const present = new Set(stored.map((blob) => blob.hash));
  const lost = new Set(
    [...referencedBlobs(root)].filter((blob) => !present.has(blob)),
  );
  const held = await heldBodies(env, collections, root, lost);
  for (const [blob, bytes] of held) await transport.putBlob(blob, bytes);
  return held.size;
}

// Blobs this device uploaded while another device may have been collecting
// them (deleting a blob right after writing a root without it): the
// collection can land after this device's upload. Each later round checks
// that they are still there and uploads them again from local content.
export async function checkUploads(
  env: SyncEnv,
  transport: Transport,
  collections: Collection[],
  state: SyncState,
) {
  const uploads = state.uploads;
  if (!uploads || !state.remote) return;
  const referenced = referencedBlobs(state.remote.root);
  const now = env.now();
  const lost = new Set<string>();
  for (const [hash, at] of Object.entries(uploads)) {
    if (!referenced.has(hash)) delete uploads[hash];
    else if (!(await transport.hasBlob(hash))) lost.add(hash);
    else if (now - at >= UPLOAD_CHECK_MS) delete uploads[hash];
  }
  const held = await heldBodies(env, collections, state.remote.root, lost);
  for (const hash of lost) {
    const bytes = held.get(hash);
    if (!bytes) {
      delete uploads[hash];
      continue;
    }
    await transport.putBlob(hash, bytes);
    uploads[hash] = now;
  }
  if (!Object.keys(uploads).length) delete state.uploads;
}

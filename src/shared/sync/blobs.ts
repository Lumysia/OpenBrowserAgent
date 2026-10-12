import { bytesText, sha256Hex } from "./codec";
import type { Collection } from "./collection";
import { recordIdOf } from "./collections";
import type { SyncEnv } from "./env";
import { bodyBytes, idsWithPrefix, type Payloads } from "./local";
import { referencedBlobs, type Root, type SyncRecord } from "./root";
import type { StoredBlob, Transport } from "./transport";

// Blob handling of a round: reading bodies, building the next root with its
// garbage list, and collecting garbage.

export const GARBAGE_GRACE_MS = 24 * 60 * 60_000;
export const ORPHAN_SWEEP_INTERVAL_MS = 7 * 24 * 60 * 60_000;

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
  const root: Root = { ...base, writer, records, garbage: [] };
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
  return uploads.size;
}

// Delete garbage older than the grace period (nobody refers to it any more)
// and drop it from the root about to be written.
export async function collectGarbage(
  transport: Transport,
  root: Root,
  now: number,
) {
  const used = referencedBlobs(root);
  const expired = root.garbage.filter(
    (entry) => now - entry.since >= GARBAGE_GRACE_MS && !used.has(entry.blob),
  );
  for (const entry of expired) await transport.deleteBlob(entry.blob);
  const gone = new Set(expired.map((entry) => entry.blob));
  root.garbage = root.garbage.filter((entry) => !gone.has(entry.blob));
  return expired.length;
}

export const hasExpiredGarbage = (root: Root, now: number) =>
  root.garbage.some((entry) => now - entry.since >= GARBAGE_GRACE_MS);

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
  let restored = 0;
  for (const collection of collections) {
    if (!collection.body) continue;
    const lost = new Map<string, string>();
    for (const id of idsWithPrefix(root.records, collection)) {
      const blob = root.records[recordIdOf(collection, id)].blob;
      if (blob && !present.has(blob)) lost.set(id, blob);
    }
    if (!lost.size) continue;
    const entries = await collection.read(env, (id) => lost.has(id));
    for (const [id, blob] of lost) {
      const entry = entries.get(id);
      if (entry?.body === undefined) continue;
      const bytes = bodyBytes(collection, entry.body);
      if ((await sha256Hex(bytes)) !== blob) continue;
      await transport.putBlob(blob, bytes);
      present.add(blob);
      restored++;
    }
  }
  return restored;
}

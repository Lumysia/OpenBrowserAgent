import { bodyFor, storedBlobs } from "./blobs";
import { isOrderId, type Collection } from "./collection";
import { recordIdOf, splitRecordId } from "./collections";
import type { SyncContext } from "./engine";
import type { SyncEnv } from "./env";
import { compareClocks, tickClock } from "./hlc";
import { project, type Payloads, type Projection } from "./local";
import type { BlobMerge, Decision } from "./plan";
import type { Root, SyncRecord } from "./root";
import type { MassDelete, SyncState } from "./state";

// Parts of a round's reconciliation: which lazy bodies to keep current,
// merging records both sides changed, and the mass-delete guard.

// Deleting more than this share of a collection with more than
// MASS_DELETE_MIN_ITEMS items waits for the user.
const MASS_DELETE_SHARE = 0.5;
const MASS_DELETE_MIN_ITEMS = 5;

// Lazy records whose body this device holds: their new content is
// downloaded with them, so the local copy never lags behind its record.
export async function localBodies(
  env: SyncEnv,
  collections: Collection[],
  decisions: Map<string, Decision>,
) {
  const held = new Set<string>();
  for (const collection of collections) {
    if (!collection.lazy) continue;
    const ids = new Set(
      [...decisions]
        .filter(
          ([recordId, decision]) =>
            decision.kind === "apply" &&
            splitRecordId(recordId).collection === collection.name,
        )
        .map(([recordId]) => splitRecordId(recordId).id),
    );
    if (!ids.size) continue;
    const entries = await collection.read(env, (id) => ids.has(id));
    for (const [id, entry] of entries)
      if (ids.has(id) && entry.body !== undefined)
        held.add(recordIdOf(collection, id));
  }
  return held;
}

export async function mergeRecord(
  context: SyncContext,
  collection: Collection,
  state: SyncState,
  recordId: string,
  decision: Extract<Decision, { kind: "merge" }>,
  payloads: Payloads,
  theirsClock: string | undefined,
) {
  const { transport, device, env } = context;
  const [clock, hlc] = tickClock(state.hlc, device, env.now());
  state.hlc = hlc;
  let data = decision.data;
  let body: unknown;
  let blob: string | undefined;
  let size: number | undefined;
  if (typeof decision.blob === "object") {
    const merge = decision.blob as BlobMerge;
    const mine = await bodyFor(transport, collection, merge.mine, payloads);
    const theirs = await bodyFor(transport, collection, merge.theirs, payloads);
    if (!mine || !theirs) return undefined;
    const base = merge.base
      ? await bodyFor(transport, collection, merge.base, payloads).catch(
          () => undefined,
        )
      : undefined;
    const pending = state.pending[recordId];
    const newer =
      pending && compareClocks(pending.clock, theirsClock) > 0
        ? "mine"
        : "theirs";
    body = collection.mergeBodies!(
      base?.body,
      mine.body,
      theirs.body,
      newer,
      `${device.slice(0, 8)}-${new Date(env.now()).toISOString().slice(0, 10)}`,
    );
    data = collection.finalizeData?.(data, body) ?? data;
    const projection = await project(
      collection,
      { data, body },
      undefined,
      payloads,
    );
    blob = projection.blob;
    size = projection.size;
  } else if (decision.blob) {
    blob = decision.blob;
    size = decision.size;
    const fetched = await bodyFor(transport, collection, blob, payloads);
    if (!fetched && !collection.lazy) return undefined;
    body = fetched?.body;
    if (body !== undefined)
      data = collection.finalizeData?.(data, body) ?? data;
  }
  const record: SyncRecord = {
    clock,
    data,
    ...(blob ? { blob } : {}),
    ...(size !== undefined ? { size } : {}),
  };
  return { record, body };
}

// Collections where applying the remote root would delete most items this
// device has: synced ones, and on joining an account its own ones.
export function massDeletes(
  collections: Collection[],
  state: SyncState,
  decisions: Map<string, Decision>,
  local: Map<string, Projection | null>,
) {
  const result: MassDelete[] = [];
  const heldHere = (recordId: string) => {
    const synced = state.synced[recordId];
    return synced ? !synced.deleted : !!local.get(recordId);
  };
  for (const collection of collections) {
    const prefix = `${collection.name}/`;
    const items = [
      ...new Set([...Object.keys(state.synced), ...local.keys()]),
    ].filter(
      (recordId) =>
        recordId.startsWith(prefix) &&
        !isOrderId(recordId.slice(prefix.length)) &&
        heldHere(recordId),
    );
    const total = items.length;
    const count = items.filter((recordId) => {
      const decision = decisions.get(recordId);
      return decision?.kind === "apply" && decision.record.deleted;
    }).length;
    if (total > MASS_DELETE_MIN_ITEMS && count > total * MASS_DELETE_SHARE)
      result.push({ collection: collection.name, count, total });
  }
  return result;
}

// The user keeps what the remote deletions would remove: this device's
// copies of exactly those records are uploaded again as new changes. A copy
// whose content is neither here nor on the server any more (a chat never
// opened here, deleted elsewhere over a day ago) cannot come back; its
// deletion is applied.
export async function keepLocalCopies(
  context: SyncContext,
  collections: Collection[],
  state: SyncState,
  remote: Root,
  decisions: Map<string, Decision>,
  local: Map<string, Projection | null>,
  payloads: Payloads,
) {
  const { env, device } = context;
  const stored = storedBlobs(remote);
  for (const collection of collections) {
    const deleted = [...decisions]
      .filter(
        ([recordId, decision]) =>
          splitRecordId(recordId).collection === collection.name &&
          decision.kind === "apply" &&
          decision.record.deleted,
      )
      .map(([recordId]) => splitRecordId(recordId).id);
    const wanted = new Set(deleted);
    const entries = await collection.read(env, (id) => wanted.has(id));
    for (const id of deleted) {
      const recordId = recordIdOf(collection, id);
      const entry = entries.get(id);
      if (!entry) continue;
      const projection = await project(
        collection,
        entry,
        state.synced[recordId],
        payloads,
      );
      local.set(recordId, projection);
      if (
        projection.blob &&
        !payloads.has(projection.blob) &&
        !stored.has(projection.blob)
      )
        continue;
      const [clock, hlc] = tickClock(state.hlc, device, env.now());
      state.hlc = hlc;
      const record: SyncRecord = {
        clock,
        data: projection.data,
        ...(projection.blob ? { blob: projection.blob } : {}),
        ...(projection.size !== undefined ? { size: projection.size } : {}),
      };
      state.pending[recordId] = record;
      decisions.set(recordId, { kind: "push", record });
    }
  }
}

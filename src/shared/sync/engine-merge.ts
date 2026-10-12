import { bodyFor } from "./blobs";
import { isOrderId, type Collection } from "./collection";
import { recordIdOf, splitRecordId } from "./collections";
import type { SyncContext } from "./engine";
import type { SyncEnv } from "./env";
import { compareClocks, tickClock } from "./hlc";
import { project, type Payloads } from "./local";
import type { BlobMerge, Decision } from "./plan";
import type { SyncRecord } from "./root";
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

// Collections where applying the remote root would delete most items.
export function massDeletes(
  collections: Collection[],
  state: SyncState,
  decisions: Map<string, Decision>,
) {
  const result: MassDelete[] = [];
  for (const collection of collections) {
    const prefix = `${collection.name}/`;
    const live = Object.entries(state.synced).filter(
      ([recordId, entry]) =>
        recordId.startsWith(prefix) &&
        !entry.deleted &&
        !isOrderId(recordId.slice(prefix.length)),
    ).length;
    const count = [...decisions].filter(
      ([recordId, decision]) =>
        recordId.startsWith(prefix) &&
        !isOrderId(recordId.slice(prefix.length)) &&
        decision.kind === "apply" &&
        decision.record.deleted &&
        state.synced[recordId] &&
        !state.synced[recordId].deleted,
    ).length;
    if (live > MASS_DELETE_MIN_ITEMS && count > live * MASS_DELETE_SHARE)
      result.push({ collection: collection.name, count, total: live });
  }
  return result;
}

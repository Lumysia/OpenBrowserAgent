import { CLOCK_LOCK } from "../locks";
import { keptBase, saveClocks } from "./bases";
import { bodyFor, storedBlobs } from "./blobs";
import {
  changedEntry,
  loadClocks,
  loadHlc,
  saveHlc,
  seenFrom,
  tickNow,
  type ClockEntry,
} from "./clocks";
import { isOrderId, ORDER_ID, type Collection } from "./collection";
import { recordIdOf, splitRecordId } from "./collections";
import type { SyncContext } from "./engine";
import type { SyncEnv } from "./env";
import { tickClock } from "./hlc";
import {
  project,
  type Payloads,
  type Projection,
  type Snapshot,
} from "./local";
import type { BlobMerge, Decision } from "./plan";
import type { Root, SyncRecord } from "./root";
import type { MassDelete } from "./state";

// Parts of a round's reconciliation: which lazy bodies to keep current,
// merging records both sides changed, and the mass-delete guards.

// Deleting more than this share of a collection with more than
// MASS_DELETE_MIN_ITEMS items waits for the user.
const MASS_DELETE_SHARE = 0.5;
const MASS_DELETE_MIN_ITEMS = 5;

const decisionsIn = (
  decisions: Map<string, Decision>,
  collection: Collection,
  match: (decision: Decision) => boolean,
) =>
  [...decisions]
    .filter(
      ([recordId, decision]) =>
        splitRecordId(recordId).collection === collection.name &&
        match(decision),
    )
    .map(([recordId]) => splitRecordId(recordId).id);

const appliesDelete = (decision: Decision) =>
  decision.kind === "apply" && !!decision.record.deleted;
const pushesDelete = (decision: Decision) =>
  decision.kind === "push" && !!decision.record.deleted;

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
      decisionsIn(
        decisions,
        collection,
        (decision) => decision.kind === "apply",
      ),
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
  id: string,
  decision: Extract<Decision, { kind: "merge" }>,
  payloads: Payloads,
  // This device's clock entry of the record.
  from: ClockEntry | undefined,
) {
  const { transport, device, env } = context;
  let data = decision.data;
  let body: unknown;
  let blob: string | undefined;
  let size: number | undefined;
  if (typeof decision.blob === "object") {
    const merge = decision.blob as BlobMerge;
    const mine = await bodyFor(transport, collection, merge.mine, payloads);
    const theirs = await bodyFor(transport, collection, merge.theirs, payloads);
    if (!mine || !theirs) return undefined;
    // The version the change was made from: on the server, else kept here
    // (collected on the server meanwhile).
    const base = merge.base
      ? ((await bodyFor(transport, collection, merge.base, payloads).catch(
          () => undefined,
        )) ?? (await keptBase(env, collection, merge.base)))
      : undefined;
    body = collection.mergeBodies!(
      base?.body,
      mine.body,
      theirs.body,
      decision.newer,
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
  const clock = await tickNow(env, device);
  const seen = seenFrom(clock, decision.versions, from);
  const record: SyncRecord = {
    clock,
    data,
    ...(blob ? { blob } : {}),
    ...(size !== undefined ? { size } : {}),
    ...(seen ? { seen } : {}),
  };
  return { record, body };
}

// Collections where the round would delete most items: remote deletions
// of items this device has, or deletions made here of items the remote has.
// Parts of items follow the answer for their items.
export function massDeletes(
  collections: Collection[],
  snapshot: Snapshot,
  remote: Root,
  decisions: Map<string, Decision>,
) {
  const result: MassDelete[] = [];
  const guard = (
    collection: Collection,
    items: string[],
    deleting: (decision: Decision) => boolean,
    local: boolean,
  ) => {
    const ids = items.filter((recordId) => {
      const { collection: name, id } = splitRecordId(recordId);
      return name === collection.name && !isOrderId(id);
    });
    const count = ids.filter((recordId) => {
      const decision = decisions.get(recordId);
      return !!decision && deleting(decision);
    }).length;
    const total = ids.length;
    if (total > MASS_DELETE_MIN_ITEMS && count > total * MASS_DELETE_SHARE)
      result.push({
        collection: collection.name,
        count,
        total,
        ...(local ? { local: true as const } : {}),
      });
  };
  const here = [...snapshot.copies]
    .filter(([, copy]) => copy)
    .map(([recordId]) => recordId);
  const there = Object.entries(remote.records)
    .filter(([, record]) => !record.deleted)
    .map(([recordId]) => recordId);
  for (const collection of collections) {
    if (collection.partOf) continue;
    guard(collection, here, appliesDelete, false);
    guard(collection, there, pushesDelete, true);
  }
  return result;
}

// The user keeps what remote deletions would remove: this device's copies
// of exactly those records are uploaded again as new changes. A copy whose
// content is neither here nor on the server any more (a chat never opened
// here, deleted elsewhere over a day ago) cannot come back; its deletion is
// applied.
export async function keepLocalCopies(
  context: SyncContext,
  collections: Collection[],
  snapshot: Snapshot,
  remote: Root,
  decisions: Map<string, Decision>,
  payloads: Payloads,
) {
  const { env, device } = context;
  const stored = storedBlobs(remote);
  for (const collection of collections) {
    const wanted = new Set(decisionsIn(decisions, collection, appliesDelete));
    const entries = await collection.read(env, (id) => wanted.has(id));
    const kept: Array<[string, Projection]> = [];
    for (const id of wanted) {
      const entry = entries.get(id);
      if (!entry) continue;
      const projection = await project(
        collection,
        entry,
        snapshot.clocks.get(recordIdOf(collection, id)),
        payloads,
      );
      if (
        projection.blob &&
        !payloads.has(projection.blob) &&
        !stored.has(projection.blob)
      )
        continue;
      kept.push([id, projection]);
    }
    if (!kept.length) continue;
    await env.lock(CLOCK_LOCK, async () => {
      const clocks = await loadClocks(env.local, collection.name);
      let hlc = await loadHlc(env.local);
      for (const [id, projection] of kept) {
        const recordId = recordIdOf(collection, id);
        const [clock, next] = tickClock(hlc, device, env.now());
        hlc = next;
        clocks[id] = await changedEntry(id, projection, clocks[id], clock);
        snapshot.clocks.set(recordId, clocks[id]);
        snapshot.copies.set(recordId, projection);
        decisions.set(recordId, {
          kind: "push",
          record: {
            clock,
            data: projection.data,
            ...(projection.blob ? { blob: projection.blob } : {}),
            ...(projection.size !== undefined ? { size: projection.size } : {}),
            ...(clocks[id].seen ? { seen: clocks[id].seen } : {}),
          },
        });
      }
      await saveClocks(env, collection, clocks, {
        items: saveHlc(hlc),
        bodies: payloads,
      });
    });
  }
}

// The user keeps what deletions made here would remove everywhere: those
// records come back from the remote copy, in the remote order.
export function restoreRemoteCopies(
  collections: Collection[],
  remote: Root,
  decisions: Map<string, Decision>,
) {
  for (const collection of collections) {
    const restored = decisionsIn(decisions, collection, pushesDelete);
    const order = recordIdOf(collection, ORDER_ID);
    if (restored.length && remote.records[order] && decisions.has(order))
      restored.push(ORDER_ID);
    for (const id of restored) {
      const recordId = recordIdOf(collection, id);
      decisions.set(recordId, {
        kind: "apply",
        record: remote.records[recordId],
      });
    }
  }
}

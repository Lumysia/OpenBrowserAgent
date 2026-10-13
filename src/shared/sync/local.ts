import { CLOCK_LOCK } from "../locks";
import { saveClocks } from "./bases";
import { hashJson, jsonBytes, sameJson, sha256Hex } from "./codec";
import {
  changedEntry,
  differs,
  loadClocks,
  loadHlc,
  saveHlc,
  type ClockEntry,
  type Clocks,
  type Copy,
} from "./clocks";
import type { Collection, LocalEntry } from "./collection";
import { recordIdOf } from "./collections";
import type { SyncEnv } from "./env";
import { tickClock, type HlcState } from "./hlc";
import type { SyncRecord } from "./root";

// The local side of a round: what local data holds now (with changes the
// edit listener missed recorded first), and writing remote records into it
// together with their clocks.

export type Projection = Copy;

// Payload bytes of bodies seen this round, by hash, for uploading.
export type Payloads = Map<string, Uint8Array>;

export function bodyBytes(collection: Collection, body: unknown) {
  return collection.body === "bytes" ? (body as Uint8Array) : jsonBytes(body);
}

// A local entry as a record's content. A body that was not read (or is not
// held: a chat never opened here) is the one its clock entry records.
export async function project(
  collection: Collection,
  entry: LocalEntry,
  clock: ClockEntry | undefined,
  payloads?: Payloads,
): Promise<Projection> {
  if (!collection.body) return { data: entry.data };
  if (entry.body === undefined) return { data: entry.data, blob: clock?.blob };
  const bytes = bodyBytes(collection, entry.body);
  const blob = await sha256Hex(bytes);
  payloads?.set(blob, bytes);
  return { data: entry.data, blob, size: bytes.length };
}

export const idsWithPrefix = (
  records: Record<string, unknown>,
  collection: Collection,
) => {
  const prefix = `${collection.name}/`;
  return Object.keys(records)
    .filter((id) => id.startsWith(prefix))
    .map((id) => id.slice(prefix.length));
};

export type Snapshot = {
  // Per record id: the local copy (null: not here).
  copies: Map<string, Projection | null>;
  clocks: Map<string, ClockEntry>;
  // Records that must not upload yet (a reply still streaming).
  held: Set<string>;
};

export const emptySnapshot = (): Snapshot => ({
  copies: new Map(),
  clocks: new Map(),
  held: new Set(),
});

// Read the enabled collections with their clocks. A copy that differs from
// its clock entry is a change the edit listener did not record (the
// background stopped meanwhile): it is recorded now.
export async function readLocal(
  env: SyncEnv,
  device: string,
  collections: Collection[],
  payloads: Payloads,
) {
  const snapshot = emptySnapshot();
  for (const collection of collections)
    await env.lock(CLOCK_LOCK, async () => {
      const clocks = await loadClocks(env.local, collection.name);
      const entries = await collection.read(
        env,
        (id) => !clocks[id] || !!clocks[id].local,
      );
      let hlc = await loadHlc(env.local);
      let changed = false;
      for (const id of new Set([...entries.keys(), ...Object.keys(clocks)])) {
        const recordId = recordIdOf(collection, id);
        const entry = entries.get(id);
        const copy = entry
          ? await project(collection, entry, clocks[id], payloads)
          : null;
        snapshot.copies.set(recordId, copy);
        if (entry && collection.hold?.(entry)) snapshot.held.add(recordId);
        else if (
          clocks[id] &&
          (await differs(copy, clocks[id], collection.defaultData?.(id)))
        ) {
          const [clock, next] = tickClock(hlc, device, env.now());
          hlc = next;
          clocks[id] = await changedEntry(id, copy, clocks[id], clock);
          changed = true;
        }
        if (clocks[id]) snapshot.clocks.set(recordId, clocks[id]);
      }
      if (changed)
        await saveClocks(env, collection, clocks, {
          items: saveHlc(hlc),
          bodies: payloads,
        });
    });
  return snapshot;
}

export type LocalWrite = {
  recordId: string;
  record: SyncRecord;
  body?: unknown;
  // The clock entry stored with it.
  entry: ClockEntry;
};

// Write remote (or merged) records into local data with their clock
// entries, in one storage call. Under the clock lock, a record is written
// only while its clock entry is still the one the snapshot holds (a change
// recorded since, even a first one, wins) and its copy is still the one the
// round compared. A copy that differs from its unchanged clock entry is a
// change no edit event recorded (a chat body saved as the background
// stopped): it is recorded now. Skipped records are compared again next
// round. Returns the record ids written; the snapshot follows them.
// `bodies`: the bodies the round read, kept for the merged changes.
export async function applyToLocal(
  env: SyncEnv,
  device: string,
  collection: Collection,
  writes: LocalWrite[],
  snapshot: Snapshot,
  bodies: Payloads,
) {
  const byId = new Map(
    writes.map((write) => [
      write.recordId.slice(collection.name.length + 1),
      write,
    ]),
  );
  let clocks: Clocks = {};
  const missed = new Map<string, Projection | null>();
  let hlc: HlcState | undefined;
  const recordMissed = async (id: string, copy: Projection | null) => {
    hlc ??= await loadHlc(env.local);
    const [clock, next] = tickClock(hlc, device, env.now());
    hlc = next;
    clocks[id] = await changedEntry(id, copy, clocks[id], clock);
    missed.set(id, copy);
  };
  const store = (items: Record<string, unknown> = {}) =>
    saveClocks(env, collection, clocks, {
      items: { ...items, ...(hlc ? saveHlc(hlc) : {}) },
      bodies,
    });
  let committed = false;
  const written = await collection.write(
    env,
    [...byId].map(([id, write]) => ({
      id,
      entry: write.record.deleted
        ? null
        : { data: write.record.data, body: write.body },
    })),
    {
      step: (run) =>
        env.lock(CLOCK_LOCK, async () => {
          clocks = await loadClocks(env.local, collection.name);
          const result = await run();
          if (missed.size && !committed) await store();
          return result;
        }),
      async verify(id, current) {
        const recordId = recordIdOf(collection, id);
        const known = snapshot.clocks.get(recordId);
        if (!sameJson(clocks[id], known)) return false;
        const expected = snapshot.copies.get(recordId) ?? null;
        const now = current ? await project(collection, current, known) : null;
        if (!(await sameCopy(now, expected))) {
          if (
            known &&
            (await differs(now, known, collection.defaultData?.(id)))
          )
            await recordMissed(id, now);
          return false;
        }
        // Content stored here meanwhile (a chat opened) that is not the new
        // version: the record is written with its content next round.
        const write = byId.get(id)!;
        return !(
          write.body === undefined &&
          !write.record.deleted &&
          current?.body !== undefined &&
          now?.blob !== write.record.blob
        );
      },
      async commit(items, ids) {
        for (const id of ids) clocks[id] = byId.get(id)!.entry;
        committed = true;
        await store(items);
      },
    },
  );
  for (const [id, copy] of missed) {
    const recordId = recordIdOf(collection, id);
    snapshot.clocks.set(recordId, clocks[id]);
    snapshot.copies.set(recordId, copy);
  }
  const result = new Set<string>();
  for (const id of written) {
    const write = byId.get(id)!;
    result.add(write.recordId);
    snapshot.clocks.set(write.recordId, write.entry);
    snapshot.copies.set(
      write.recordId,
      write.record.deleted
        ? null
        : {
            data: write.record.data,
            blob: write.record.blob,
            size: write.record.size,
          },
    );
  }
  return result;
}

async function sameCopy(left: Projection | null, right: Projection | null) {
  if (!left || !right) return left === right;
  return (
    left.blob === right.blob &&
    (await hashJson(left.data)) === (await hashJson(right.data))
  );
}

import { hashJson, jsonBytes, sha256Hex } from "./codec";
import {
  idOfKey,
  isOrderId,
  ownsKey,
  type Collection,
  type LocalEntry,
} from "./collection";
import { recordIdOf } from "./collections";
import type { SyncEnv } from "./env";
import { tickClock } from "./hlc";
import type { SyncedEntry } from "./plan";
import type { SyncRecord } from "./root";
import type { DirtyKeys, SyncState } from "./state";

// The local side of a round: turning local data into records (and noticing
// what changed), and writing remote records into local data.

export type Projection = { data: unknown; blob?: string; size?: number };

// Payload bytes of bodies seen this round, by hash, for uploading.
export type Payloads = Map<string, Uint8Array>;

export function bodyBytes(collection: Collection, body: unknown) {
  return collection.body === "bytes" ? (body as Uint8Array) : jsonBytes(body);
}

export async function project(
  collection: Collection,
  entry: LocalEntry,
  synced: SyncedEntry | undefined,
  payloads?: Payloads,
): Promise<Projection> {
  if (!collection.body) return { data: entry.data };
  // Lazy content this device does not hold is the synced version.
  if (entry.body === undefined) return { data: entry.data, blob: synced?.blob };
  const bytes = bodyBytes(collection, entry.body);
  const blob = await sha256Hex(bytes);
  payloads?.set(blob, bytes);
  return { data: entry.data, blob, size: bytes.length };
}

// Equal content: data and blob match.
export async function sameContent(
  projection: Projection,
  version: { dataHash?: string; blob?: string; deleted?: true } | undefined,
) {
  if (!version || version.deleted) return false;
  return (
    projection.blob === version.blob &&
    (await hashJson(projection.data)) === version.dataHash
  );
}

export async function versionOf(record: SyncRecord): Promise<SyncedEntry> {
  if (record.deleted) return { clock: record.clock, deleted: true };
  return {
    clock: record.clock,
    dataHash: await hashJson(record.data),
    blob: record.blob,
  };
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

export type LocalScan = {
  // Local projection per record id, for collections read this round.
  local: Map<string, Projection | null>;
  // Dirty keys compared this round; minus `held`, they can be cleared.
  processed: Set<string>;
  // Dirty keys to keep (their change is held back).
  held: Set<string>;
};

// Compare local data with what was synced and stamp every change with a
// clock at the time the change was first seen.
export async function collectLocalChanges(
  env: SyncEnv,
  state: SyncState,
  collections: Collection[],
  dirty: DirtyKeys,
  device: string,
  payloads: Payloads,
): Promise<LocalScan> {
  const scan: LocalScan = {
    local: new Map(),
    processed: new Set(),
    held: new Set(),
  };
  for (const collection of collections) {
    const keys = Object.keys(dirty).filter((key) => ownsKey(collection, key));
    const full = state.rescan.includes(collection.name);
    if (!keys.length && !full) continue;
    keys.forEach((key) => scan.processed.add(key));
    const bodyIds = new Set(
      keys
        .map((key) => idOfKey(collection, key))
        .filter((id) => id !== undefined),
    );
    const seen = keys.length
      ? Math.min(...keys.map((key) => dirty[key].at))
      : env.now();
    const entries = await collection.read(
      env,
      (id) =>
        full ||
        bodyIds.has(id) ||
        !state.synced[recordIdOf(collection, id)] ||
        !!state.pending[recordIdOf(collection, id)],
    );
    const ids = new Set([
      ...entries.keys(),
      ...idsWithPrefix(state.synced, collection),
      ...idsWithPrefix(state.pending, collection),
    ]);
    for (const id of ids) {
      const recordId = recordIdOf(collection, id);
      const entry = entries.get(id);
      if (entry && collection.hold?.(entry)) {
        keys.forEach((key) => scan.held.add(key));
        continue;
      }
      const synced = state.synced[recordId];
      const pending = state.pending[recordId];
      const projection = entry
        ? await project(collection, entry, synced, payloads)
        : null;
      if (projection && isOrderId(id)) {
        const known = (pending ?? state.remote?.root.records[recordId])?.data;
        if (keepsOrder(projection.data, known)) projection.data = known;
      }
      scan.local.set(recordId, projection);
      const stamp = () => {
        const [clock, hlc] = tickClock(state.hlc, device, seen);
        state.hlc = hlc;
        return clock;
      };
      if (!projection) {
        const base = pending ?? synced;
        if (pending && !synced) delete state.pending[recordId];
        else if (base && !base.deleted)
          state.pending[recordId] = { clock: stamp(), deleted: true };
        continue;
      }
      if (await sameContent(projection, synced)) {
        delete state.pending[recordId];
        continue;
      }
      if (pending && (await sameContent(projection, await versionOf(pending))))
        continue;
      state.pending[recordId] = {
        clock: stamp(),
        data: projection.data,
        ...(projection.blob ? { blob: projection.blob } : {}),
        ...(projection.size !== undefined ? { size: projection.size } : {}),
      };
    }
  }
  return scan;
}

export type LocalWrite = {
  recordId: string;
  record: SyncRecord;
  body?: unknown;
};

// Write remote (or merged) records into local data. A record whose local
// copy changed since this round looked at it is skipped; it is compared
// again next round. Returns the record ids written.
export async function applyToLocal(
  env: SyncEnv,
  collection: Collection,
  writes: LocalWrite[],
  expected: Map<string, Projection | null>,
  state: SyncState,
) {
  const byId = new Map(
    writes.map((write) => [
      write.recordId.slice(collection.name.length + 1),
      write,
    ]),
  );
  const written = await collection.write(
    env,
    [...byId].map(([id, write]) => ({
      id,
      entry: write.record.deleted
        ? null
        : { data: write.record.data, body: write.body },
    })),
    async (id, current) => {
      const recordId = recordIdOf(collection, id);
      const synced = state.synced[recordId];
      const want = expected.has(recordId)
        ? expected.get(recordId)
        : synced && !synced.deleted
          ? { data: undefined, blob: synced.blob }
          : null;
      if (!current) return !want;
      if (!want) return false;
      const now = await project(collection, current, synced);
      if (want.data === undefined) return sameContent(now, synced);
      return (
        now.blob === want.blob &&
        (await hashJson(now.data)) === (await hashJson(want.data))
      );
    },
  );
  const result = new Set<string>();
  for (const id of written) result.add(recordIdOf(collection, id));
  return result;
}

// A local list order that agrees with the known order (items missing here,
// such as ones whose content is still to come, aside) is no change.
function keepsOrder(local: unknown, known: unknown) {
  if (!Array.isArray(local) || !Array.isArray(known)) return false;
  let last = -1;
  for (const id of local) {
    const index = known.indexOf(id);
    if (index <= last) return false;
    last = index;
  }
  return true;
}

import { CLOCK_LOCK } from "../locks";
import { STORAGE_KEYS } from "../storage-keys";
import { hashJson, sameJson } from "./codec";
import { isOrderId } from "./collection";
import { readKey, type StorageArea, type SyncEnv } from "./env";
import {
  INITIAL_HLC,
  observeClock,
  tickClock,
  type Clock,
  type HlcState,
} from "./hlc";
import type { SyncRecord } from "./root";

// Per record, on this device and independent of any backend: the clock of
// its last change (made here, or a remote change stored here) and what the
// local copy held then. A record with no entry was never changed since
// changes were recorded (defaults, data from before): it loses to any
// record that has a clock.

export type Version = {
  clock: Clock;
  deleted?: true;
  dataHash?: string;
  blob?: string;
  // The data itself, kept only as a change's base: a three-way merge takes
  // each field from the side that changed it.
  data?: unknown;
};

export type ClockEntry = Version & {
  // A change made here that no backend has confirmed yet...
  local?: true;
  // ...made from this version, which three-way merges compare against.
  base?: Version;
  // The list order an order record's version holds.
  order?: string[];
};

export type Clocks = Record<string, ClockEntry>;

export const clocksKey = (collection: string) =>
  `${STORAGE_KEYS.syncClocks}:${collection}`;

export async function loadClocks(local: StorageArea, collection: string) {
  return (await readKey<Clocks>(local, clocksKey(collection))) ?? {};
}

export async function loadHlc(local: StorageArea) {
  return (await readKey<HlcState>(local, STORAGE_KEYS.syncHlc)) ?? INITIAL_HLC;
}

export const saveHlc = (hlc: HlcState) => ({ [STORAGE_KEYS.syncHlc]: hlc });

// A new clock for a change seen now, for work outside a tracking pass (a
// merge, a kept copy).
export function tickNow(env: SyncEnv, device: string) {
  return env.lock(CLOCK_LOCK, async () => {
    const [clock, hlc] = tickClock(await loadHlc(env.local), device, env.now());
    await env.local.set(saveHlc(hlc));
    return clock;
  });
}

// Take in the newest clock of a remote root, so later local changes order
// after everything already seen.
export function observeRemote(env: SyncEnv, clock: Clock | undefined) {
  if (!clock) return Promise.resolve();
  return env.lock(CLOCK_LOCK, async () => {
    const hlc = await loadHlc(env.local);
    const next = observeClock(hlc, clock);
    if (next !== hlc) await env.local.set(saveHlc(next));
  });
}

export async function versionOf(record: SyncRecord): Promise<Version> {
  if (record.deleted) return { clock: record.clock, deleted: true };
  return {
    clock: record.clock,
    dataHash: await hashJson(record.data),
    ...(record.blob ? { blob: record.blob } : {}),
  };
}

// A record version as the base of a change made here.
export async function baseOf(record: SyncRecord): Promise<Version> {
  const version = await versionOf(record);
  return record.deleted ? version : { ...version, data: record.data };
}

// The entry of a record version held here as stored (applied or confirmed).
export async function entryOf(id: string, record: SyncRecord) {
  const entry: ClockEntry = await versionOf(record);
  if (isOrderId(id) && Array.isArray(record.data))
    entry.order = record.data as string[];
  return entry;
}

const sharedVersion = (entry: ClockEntry): Version => ({
  clock: entry.clock,
  ...(entry.deleted ? { deleted: true } : {}),
  ...(entry.dataHash ? { dataHash: entry.dataHash } : {}),
  ...(entry.blob ? { blob: entry.blob } : {}),
});

// What a local copy is, for comparing it with its clock entry.
export type Copy = { data: unknown; blob?: string; size?: number };

// The entry of a change made here: `copy` (null: removed), from `previous`.
// `before`: the data the copy held before the change, if known (an edit
// event's old value), kept with the base when it is that version's.
export async function changedEntry(
  id: string,
  copy: Copy | null,
  previous: ClockEntry | undefined,
  clock: Clock,
  before?: { data: unknown },
): Promise<ClockEntry> {
  const base = previous?.local
    ? previous.base
    : previous && sharedVersion(previous);
  if (
    base &&
    !previous?.local &&
    before &&
    !base.deleted &&
    (await hashJson(before.data)) === base.dataHash
  )
    base.data = before.data;
  const entry: ClockEntry = { clock, local: true, ...(base ? { base } : {}) };
  if (!copy) return { ...entry, deleted: true };
  entry.dataHash = await hashJson(copy.data);
  if (copy.blob) entry.blob = copy.blob;
  if (isOrderId(id) && Array.isArray(copy.data))
    entry.order = copy.data as string[];
  return entry;
}

// The entry once a backend holds `record`: a later local change made since
// keeps waiting, now made from that version.
export async function confirmedEntry(
  id: string,
  current: ClockEntry,
  record: SyncRecord,
): Promise<ClockEntry> {
  if (current.clock === record.clock) return entryOf(id, record);
  if (!current.local) return current;
  return { ...current, base: await baseOf(record) };
}

// Whether a local copy differs from the version its clock entry records.
// A removed record whose copy holds its default (`defaultData`: settings
// stored again after their key was removed) is unchanged.
export async function differs(
  copy: Copy | null,
  entry: ClockEntry,
  defaultData?: unknown,
) {
  if (!copy) return !entry.deleted;
  if (entry.deleted)
    return defaultData === undefined || !sameJson(copy.data, defaultData);
  if (entry.order && keepsOrder(copy.data, entry.order)) return false;
  return (
    copy.blob !== entry.blob || (await hashJson(copy.data)) !== entry.dataHash
  );
}

// A local list order that agrees with the recorded order (items missing
// here, such as ones still to come, aside) is no change.
export function keepsOrder(local: unknown, known: unknown) {
  if (!Array.isArray(local) || !Array.isArray(known)) return false;
  let last = -1;
  for (const id of local) {
    const index = known.indexOf(id);
    if (index <= last) return false;
    last = index;
  }
  return true;
}

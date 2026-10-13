import { CLOCK_LOCK } from "../locks";
import { STORAGE_KEYS } from "../storage-keys";
import { hashJson, sameJson } from "./codec";
import { isOrderId } from "./collection";
import { readKey, type StorageArea, type SyncEnv } from "./env";
import {
  afterState,
  compareClocks,
  INITIAL_HLC,
  observeClock,
  parseClock,
  tickClock,
  type Clock,
  type HlcState,
} from "./hlc";
import { maxRootClock, type Root, type SyncRecord } from "./root";

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
  // Changes the version includes besides its own (SyncRecord.seen).
  seen?: Clock[];
};

export type ClockEntry = Version & {
  // A change made here that no backend has confirmed yet (`seen`: what it
  // includes besides itself)...
  local?: true;
  // ...made from this version, which three-way merges compare against.
  base?: Version;
  // The version of this change (or of one it was made on top of) that this
  // device's last root write pushed, until a root read shows whether the
  // remote record includes it: then it is the base of what is left. It is
  // recorded before the write, since the write may land while its answer is
  // lost (a timeout, the browser closed meanwhile).
  sent?: Version;
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
// after everything already seen. Returns whether the root holds a change
// stamped with this device's id that this device never made: another
// install uses the same id.
export function observeRemote(env: SyncEnv, remote: Root, device: string) {
  return env.lock(CLOCK_LOCK, async () => {
    const hlc = await loadHlc(env.local);
    let foreign = false;
    for (const record of Object.values(remote.records))
      for (const held of [record.clock, ...(record.seen ?? [])])
        if (parseClock(held)?.device === device && afterState(hlc, held))
          foreign = true;
    const newest = maxRootClock(remote);
    const next = newest ? observeClock(hlc, newest) : hlc;
    if (next !== hlc) await env.local.set(saveHlc(next));
    return foreign;
  });
}

// Whether a version holds the change made at `clock`: it is the version's
// own clock or one the version includes. Only that exact clock proves it
// (clocks are unique per change): a later clock of the same device id may
// be another install's.
export function includes(
  version: { clock: Clock; seen?: Clock[] },
  clock: Clock,
) {
  return version.clock === clock || !!version.seen?.includes(clock);
}

// What a version made at `clock` from (or merging) `versions` includes
// besides itself: per device, its newest change they hold. The device
// making it is no exception: another install may share its id, and only
// these clocks show that the version holds that install's change.
export function seenFrom(
  clock: Clock,
  versions: Array<{ clock: Clock; seen?: Clock[] } | undefined>,
) {
  const newest = new Map<string, Clock>();
  for (const version of versions)
    for (const held of version
      ? [version.clock, ...(version.seen ?? [])]
      : []) {
      const parsed = parseClock(held);
      // Data of unknown age (wall 0) holds no change.
      if (!parsed?.wall || held === clock) continue;
      if (compareClocks(held, newest.get(parsed.device)) > 0)
        newest.set(parsed.device, held);
    }
  return newest.size ? [...newest.values()].sort() : undefined;
}

const withSeen = (seen: Clock[] | undefined) => (seen ? { seen } : {});

export async function versionOf(record: SyncRecord): Promise<Version> {
  if (record.deleted)
    return { clock: record.clock, deleted: true, ...withSeen(record.seen) };
  return {
    clock: record.clock,
    dataHash: await hashJson(record.data),
    ...(record.blob ? { blob: record.blob } : {}),
    ...withSeen(record.seen),
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
  ...withSeen(entry.seen),
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
  const seen = seenFrom(clock, [previous]);
  const entry: ClockEntry = {
    clock,
    local: true,
    ...(base ? { base } : {}),
    ...(previous?.local && previous.sent ? { sent: previous.sent } : {}),
    ...withSeen(seen),
  };
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
  return { ...unsent(current), base: await baseOf(record) };
}

// The entry once its change is pushed in `record` (the same version, or one
// it was made on top of); not yet a confirmation. Recorded before the root
// write: one that lands while its answer is lost is still the version later
// changes here were made on top of.
export async function sentEntry(
  _id: string,
  current: ClockEntry,
  record: SyncRecord,
) {
  return current.local ? { ...current, sent: await baseOf(record) } : current;
}

// The entry once a root read shows its push was replaced without it.
export function unsent(current: ClockEntry): ClockEntry {
  const { sent: _sent, ...rest } = current;
  return rest;
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

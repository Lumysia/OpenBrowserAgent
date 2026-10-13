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
  // Clocks this install issued for the record that the version held here
  // still holds (its own changes and merges, pushed or not). Only the
  // install that made a change ever asks whether a version includes it, so
  // a version it makes leaves out those it no longer asks about.
  own?: Clock[];
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

// What this install knows of the clocks it issued, from its clock entries:
// those its versions hold, and the oldest one pushed and not yet confirmed.
export type IssuedClocks = { known: Set<Clock>; oldestSent?: Clock };

export function issuedClocks(entries: Iterable<ClockEntry>): IssuedClocks {
  const known = new Set<Clock>();
  let oldestSent: Clock | undefined;
  for (const entry of entries) {
    for (const clock of [...asked(entry), ...(entry.own ?? [])])
      known.add(clock);
    if (entry.sent && (!oldestSent || entry.sent.clock < oldestSent))
      oldestSent = entry.sent.clock;
  }
  return { known, oldestSent };
}

// Take in the newest clock of a remote root, so later local changes order
// after everything already seen. Returns whether the root holds a change
// stamped with this device's id that this device never made: another
// install uses the same id. Such a clock is newer than every clock this
// install issued, or (when the other install's time runs behind) one it
// does not know that is newer than a push it is still waiting to confirm.
export function observeRemote(
  env: SyncEnv,
  remote: Root,
  device: string,
  issued: IssuedClocks,
) {
  return env.lock(CLOCK_LOCK, async () => {
    const hlc = await loadHlc(env.local);
    const { known, oldestSent } = issued;
    let foreign = false;
    for (const record of Object.values(remote.records))
      for (const held of [record.clock, ...(record.seen ?? [])])
        if (
          parseClock(held)?.device === device &&
          (afterState(hlc, held) ||
            (!!oldestSent &&
              !known.has(held) &&
              compareClocks(held, oldestSent) > 0))
        )
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

type Held = { clock: Clock; seen?: Clock[] };

const heldBy = (version: Held) => [version.clock, ...(version.seen ?? [])];

// The clocks of its own an entry's install still asks about: its change no
// backend confirmed yet, and its push waiting for confirmation. A copied
// profile asks about them too, so versions keep naming them.
export function asked(entry: ClockEntry | undefined): Clock[] {
  if (!entry) return [];
  return [
    ...(entry.local ? [entry.clock] : []),
    ...(entry.sent ? [entry.sent.clock] : []),
  ];
}

// The clocks this install issued that `from` (the entry a new version is
// made from) holds and no longer asks about: no install asks about them.
function settled(from: ClockEntry | undefined) {
  const keep = asked(from);
  return (from?.own ?? []).filter((clock) => !keep.includes(clock));
}

// How long a version keeps naming the changes it includes. An install asks
// about its change until its next sync after pushing it; one that comes
// back later than this merges it again from the version it was made from.
// The bound keeps records small for browser account sync, whose quota the
// clocks of every install that ever changed a record would fill over time.
export const SEEN_KEEP_MS = 90 * 24 * 60 * 60_000;

// What a version made at `clock` from (or merging) `versions` includes
// besides itself: every change they hold, except those of this install it
// no longer asks about (`from`: its entry) and those older than
// SEEN_KEEP_MS. Clocks of one device id are never pruned against each
// other: two installs may share an id (a copied profile), and a version
// that holds one install's change must name it for that install to see it.
export function seenFrom(
  clock: Clock,
  versions: Array<Held | undefined>,
  from: ClockEntry | undefined,
) {
  const left = new Set(settled(from));
  const oldest = (parseClock(clock)?.wall ?? 0) - SEEN_KEEP_MS;
  const seen = new Set<Clock>();
  for (const version of versions)
    for (const held of version ? heldBy(version) : []) {
      const wall = parseClock(held)?.wall;
      // Data of unknown age (wall 0) holds no change.
      if (wall && wall >= oldest && held !== clock && !left.has(held))
        seen.add(held);
    }
  return seen.size ? [...seen].sort() : undefined;
}

// The versions an entry holds or names: its own, the one its change was made
// from and the one it pushed (both may be on the server).
const versionsOf = (entry: ClockEntry): Held[] =>
  [entry, entry.base, entry.sent].filter((held): held is Held => !!held);

// The `own` clocks of an entry made at `clock` (a change or merge made
// here; undefined: a version from elsewhere) from `from`, whose versions
// `held` it holds.
export function ownFrom(
  from: ClockEntry | undefined,
  held: Held[],
  clock?: Clock,
) {
  const holds = new Set(held.flatMap(heldBy));
  const own = (from?.own ?? []).filter((issued) => holds.has(issued));
  if (clock) own.push(clock);
  return own.length ? { own } : {};
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

// The entry of a record version held here as stored (applied or confirmed),
// in place of `previous`.
export async function entryOf(
  id: string,
  record: SyncRecord,
  previous?: ClockEntry,
) {
  const entry: ClockEntry = {
    ...(await versionOf(record)),
    ...ownFrom(previous, [record]),
  };
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
  const seen = seenFrom(clock, [previous], previous);
  const entry: ClockEntry = {
    clock,
    local: true,
    ...(base ? { base } : {}),
    ...(previous?.local && previous.sent ? { sent: previous.sent } : {}),
    ...withSeen(seen),
    ...ownFrom(previous, previous ? versionsOf(previous) : [], clock),
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
  if (current.clock === record.clock) return entryOf(id, record, current);
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

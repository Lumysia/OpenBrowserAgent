import { CLOCK_LOCK } from "../locks";
import { sameJson } from "./codec";
import {
  changedEntry,
  clocksKey,
  differs,
  loadClocks,
  loadHlc,
  saveHlc,
} from "./clocks";
import { ownsKey, type Collection, type LocalEntry } from "./collection";
import { SYNC_COLLECTIONS } from "./collections";
import type { SyncEnv } from "./env";
import { tickClock } from "./hlc";
import { project } from "./local";

// Recording local edits: the background's storage.onChanged listener passes
// every change of local data here. Each record the change touched gets a new
// clock if its value now differs from what its clock entry records; records
// with no entry only if the change itself altered them. The engine stores
// clock entries with the data it writes (and clearing removes them with the
// data, in the same storage call), so its writes are never recorded as
// edits.

export type StorageChanges = Record<
  string,
  { oldValue?: unknown; newValue?: unknown }
>;

type Touched = { removed: boolean };

// Records a storage change altered, by id. A record missing from a value
// that holds the whole collection has the collection's default, if any.
function touched(collection: Collection, changes: StorageChanges) {
  const result = new Map<string, Touched>();
  for (const [key, change] of Object.entries(changes)) {
    if (!ownsKey(collection, key)) continue;
    const before = collection.entriesOf(key, change.oldValue);
    const after = collection.entriesOf(key, change.newValue);
    const valueOf = (side: typeof before, id: string): LocalEntry | undefined =>
      side.entries.get(id) ??
      (side.complete && collection.defaultData?.(id) !== undefined
        ? { data: collection.defaultData(id) }
        : undefined);
    for (const id of new Set([
      ...before.entries.keys(),
      ...after.entries.keys(),
    ])) {
      const old = valueOf(before, id);
      const next = valueOf(after, id);
      // Content removed from a key that holds only content (a chat's
      // messages) leaves the record in place.
      if (sameJson(old, next) || (!next && !after.complete)) continue;
      const removed = after.complete && !next;
      result.set(id, { removed: removed || !!result.get(id)?.removed });
    }
  }
  return result;
}

export async function recordLocalChanges(
  env: SyncEnv,
  device: string,
  changes: StorageChanges,
) {
  let recorded = 0;
  for (const collection of SYNC_COLLECTIONS) {
    // Written together with its clocks: the engine's write, or a clear.
    if (clocksKey(collection.name) in changes) continue;
    const records = touched(collection, changes);
    if (!records.size) continue;
    await env.lock(CLOCK_LOCK, async () => {
      const clocks = await loadClocks(env.local, collection.name);
      const entries = await collection.read(env, (id) => records.has(id));
      let hlc = await loadHlc(env.local);
      let changed = false;
      for (const [id, { removed }] of records) {
        const entry = entries.get(id);
        const copy = entry
          ? await project(collection, entry, clocks[id])
          : null;
        const known = clocks[id];
        const edited = known
          ? await differs(copy, known)
          : copy
            ? !removed
            : removed;
        if (!edited) continue;
        const [clock, next] = tickClock(hlc, device, env.now());
        hlc = next;
        clocks[id] = await changedEntry(id, copy, known, clock);
        changed = true;
        recorded++;
      }
      if (changed)
        await env.local.set({
          [clocksKey(collection.name)]: clocks,
          ...saveHlc(hlc),
        });
    });
  }
  return recorded;
}

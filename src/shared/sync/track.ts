import { CLOCK_LOCK } from "../locks";
import { STORAGE_KEYS } from "../storage-keys";
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

// `before`: the record's value before the change.
type Touched = { removed: boolean; before?: LocalEntry };

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
      const earlier = result.get(id);
      result.set(id, {
        removed: removed || !!earlier?.removed,
        before: earlier ? earlier.before : old,
      });
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
      for (const [id, { removed, before }] of records) {
        const entry = entries.get(id);
        const copy = entry
          ? await project(collection, entry, clocks[id])
          : null;
        const known = clocks[id];
        const edited = known
          ? await differs(copy, known, collection.defaultData?.(id))
          : copy
            ? !removed
            : removed;
        if (!edited) continue;
        const [clock, next] = tickClock(hlc, device, env.now());
        hlc = next;
        clocks[id] = await changedEntry(id, copy, known, clock, before);
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

// How long a round waits for the edit listener before storing remote
// changes anyway (the listener is not running: a page's environment).
const SETTLE_TIMEOUT_MS = 5_000;
const MARKER = STORAGE_KEYS.syncEditMarker;

// The background's edit listener. Change events arrive after the write
// resolves, so a round could read an edit before the edit has a clock and
// store a remote value over it. Events are recorded in arrival order, and
// `settle` writes a marker and waits until the listener has passed it: every
// edit made before then has its clock, which the round's commit checks.
export function createEditListener(
  env: SyncEnv,
  device: () => Promise<string>,
) {
  let chain: Promise<unknown> = Promise.resolve();
  const waiting = new Map<string, () => void>();
  function onChanged(changes: StorageChanges) {
    const job = chain.then(async () =>
      recordLocalChanges(env, await device(), changes),
    );
    chain = job.catch(() => undefined);
    const marker = changes[MARKER]?.newValue;
    if (typeof marker === "string")
      void chain.then(() => waiting.get(marker)?.());
    return job;
  }
  async function settle() {
    const marker = crypto.randomUUID();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const passed = new Promise<void>((resolve) => {
      waiting.set(marker, resolve);
      timer = setTimeout(resolve, SETTLE_TIMEOUT_MS);
    });
    try {
      await env.local.set({ [MARKER]: marker });
      await passed;
    } finally {
      clearTimeout(timer);
      waiting.delete(marker);
    }
  }
  return { onChanged, settle };
}

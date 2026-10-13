import { CLOCK_LOCK } from "../locks";
import { STORAGE_KEYS } from "../storage-keys";
import { loadClocks, type Clocks } from "./clocks";
import type { Collection, LocalEntry } from "./collection";
import { readKey, type SyncEnv } from "./env";
import { project } from "./local";

// Bodies of the versions this device's unconfirmed changes were made from,
// for collections that merge bodies (chats, skill and workspace files). A
// merge needs that version, but the server collects a blob a day after no
// record refers to it: a change made offline for longer would otherwise
// merge without it and bring back what the other device removed. A body is
// kept from the edit event that changed it, while its record's change waits
// for a confirmation.

type Bases = Record<string, { blob: string; body: unknown }>;

export const basesKey = (collection: string) =>
  `${STORAGE_KEYS.syncBases}:${collection}`;

const loadBases = async (env: SyncEnv, collection: string) =>
  (await readKey<Bases>(env.local, basesKey(collection))) ?? {};

// Whether the record's change may still be merged from `blob`: the version
// it was made from, or its pushed version (the base once confirmed).
const needed = (clocks: Clocks, id: string, blob: string) =>
  !!clocks[id]?.local &&
  (clocks[id].base?.blob === blob || clocks[id].sent?.blob === blob);

// Storage items to write with `clocks` (under the clock lock): the bodies
// changes just recorded were made from, when the edit event's old value is
// such a version. Empty when nothing new is kept.
export async function keepBases(
  env: SyncEnv,
  collection: Collection,
  clocks: Clocks,
  before: Map<string, LocalEntry | undefined>,
): Promise<Record<string, Bases>> {
  if (!collection.mergeBodies) return {};
  const wanted: Array<[string, string, unknown]> = [];
  for (const [id, entry] of before) {
    if (entry?.body === undefined) continue;
    const { blob } = await project(collection, entry, undefined);
    if (blob && needed(clocks, id, blob)) wanted.push([id, blob, entry.body]);
  }
  if (!wanted.length) return {};
  const bases = await loadBases(env, collection.name);
  let changed = false;
  for (const [id, blob, body] of wanted) {
    if (bases[id]?.blob === blob) continue;
    bases[id] = { blob, body };
    changed = true;
  }
  return changed ? { [basesKey(collection.name)]: bases } : {};
}

// The kept body of `blob`, the base of the record's change.
export async function keptBase(
  env: SyncEnv,
  collection: Collection,
  id: string,
  blob: string,
) {
  const kept = (await loadBases(env, collection.name))[id];
  return kept?.blob === blob ? { body: kept.body } : undefined;
}

// Drop bodies no unconfirmed change needs any more.
export async function pruneBases(env: SyncEnv, collections: Collection[]) {
  for (const collection of collections) {
    if (!collection.mergeBodies) continue;
    await env.lock(CLOCK_LOCK, async () => {
      const bases = await loadBases(env, collection.name);
      const ids = Object.keys(bases);
      if (!ids.length) return;
      const clocks = await loadClocks(env.local, collection.name);
      const kept = ids.filter((id) => needed(clocks, id, bases[id].blob));
      if (kept.length === ids.length) return;
      if (!kept.length) return env.local.remove(basesKey(collection.name));
      await env.local.set({
        [basesKey(collection.name)]: Object.fromEntries(
          kept.map((id) => [id, bases[id]]),
        ),
      });
    });
  }
}

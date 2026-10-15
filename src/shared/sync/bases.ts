import { STORAGE_KEYS } from "../storage-keys";
import { parseBody } from "./blobs";
import { clocksKey, type Clocks } from "./clocks";
import type { Collection } from "./collection";
import { readKey, type SyncEnv } from "./env";
import type { Payloads } from "./local";

// Writing clock entries, and the bodies their unconfirmed changes need.
// A change of a collection that merges bodies (chats, skill and workspace
// files) merges from the version it was made from (`base`), or from its
// pushed version (`sent`) once that is confirmed. The server collects a blob
// a day after no record refers to it, so a change waiting longer would merge
// without it and bring back what the other device removed. Every clock
// write goes through `saveClocks`, which keeps (in the same storage call)
// the body of each such version the writer had and drops the bodies no
// unconfirmed change needs any more.

// `sync-bases:<collection>`: the blobs kept, each body under its own key.
const basesKey = (collection: string) =>
  `${STORAGE_KEYS.syncBases}:${collection}`;
const bodyKey = (collection: string, blob: string) =>
  `${basesKey(collection)}:${blob}`;

async function keptBlobs(env: SyncEnv, collection: string) {
  const index = await readKey<unknown>(env.local, basesKey(collection));
  return Array.isArray(index) ? (index as string[]) : [];
}

// Blobs unconfirmed changes may still merge from.
function neededBlobs(clocks: Clocks) {
  const needed = new Set<string>();
  for (const entry of Object.values(clocks)) {
    if (!entry.local) continue;
    if (entry.base?.blob) needed.add(entry.base.blob);
    if (entry.sent?.blob) needed.add(entry.sent.blob);
  }
  return needed;
}

type ClockWrite = {
  // The clocks differ from the stored ones (else only bodies are kept).
  changed?: boolean;
  // Written in the same storage call (the data, the HLC state).
  items?: Record<string, unknown>;
  // Bodies the writer has, by blob: those of needed versions are kept.
  bodies?: Payloads;
};

// Store a collection's clock entries; the caller holds the clock lock.
export async function saveClocks(
  env: SyncEnv,
  collection: Collection,
  clocks: Clocks,
  { changed = true, items = {}, bodies }: ClockWrite = {},
) {
  const write: Record<string, unknown> = {
    ...items,
    ...(changed ? { [clocksKey(collection.name)]: clocks } : {}),
  };
  let stale: string[] = [];
  if (collection.mergeBodies) {
    const needed = neededBlobs(clocks);
    const kept = await keptBlobs(env, collection.name);
    const next = kept.filter((blob) => needed.has(blob));
    stale = kept.filter((blob) => !needed.has(blob));
    for (const blob of needed) {
      const payload = bodies?.get(blob);
      if (next.includes(blob) || !payload) continue;
      write[bodyKey(collection.name, blob)] = parseBody(collection, payload);
      next.push(blob);
    }
    stale = stale.map((blob) => bodyKey(collection.name, blob));
    if (!next.length && kept.length) stale.push(basesKey(collection.name));
    else if (next.length !== kept.length || stale.length)
      write[basesKey(collection.name)] = next;
  }
  if (Object.keys(write).length) await env.local.set(write);
  if (stale.length) await env.local.remove(stale);
}

// The kept body of `blob`, a version an unconfirmed change merges from.
export async function keptBase(
  env: SyncEnv,
  collection: Collection,
  blob: string,
) {
  if (!(await keptBlobs(env, collection.name)).includes(blob)) return;
  const key = bodyKey(collection.name, blob);
  const body = (await env.local.get(key))[key];
  return body === undefined ? undefined : { body };
}

// Storage keys of a collection's clocks and kept bodies, to remove with
// its data.
export async function clockKeys(env: SyncEnv, collection: string) {
  return [
    clocksKey(collection),
    basesKey(collection),
    ...(await keptBlobs(env, collection)).map((blob) =>
      bodyKey(collection, blob),
    ),
  ];
}

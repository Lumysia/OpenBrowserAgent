import { CLOCK_LOCK, SYNC_LOCK } from "../locks";
import { SYNC_GROUPS, type SyncGroupSettings } from "../storage-keys";
import { saveClocks } from "./bases";
import {
  checkUploads,
  deleteBlobs,
  dropExpiredGarbage,
  nextRoot,
  ORPHAN_SWEEP_INTERVAL_MS,
  restoreLostBlobs,
  storedBlobs,
  sweepOrphans,
  uploadBlobs,
} from "./blobs";
import {
  confirmedEntry,
  includes,
  issuedClocks,
  loadClocks,
  observeRemote,
  sentEntry,
  type ClockEntry,
  type Clocks,
} from "./clocks";
import { canonicalJson } from "./codec";
import type { Collection } from "./collection";
import { rotateDeviceId } from "./device";
import {
  enabledCollections,
  splitRecordId,
  syncCollection,
} from "./collections";
import type { SyncEnv } from "./env";
import { compareClocks } from "./hlc";
import {
  keysOn,
  openRoot,
  removeLocalKeyring,
  roundKeys,
  sealRoot,
  type RoundKeys,
} from "./keys";
import { project, readLocal, type Payloads, type Snapshot } from "./local";
import { reconcile } from "./reconcile";
import { emptyRoot, type Root, type SyncRecord } from "./root";
import {
  loadSyncState,
  saveSyncState,
  SYNC_WARNINGS,
  type SyncState,
  type MassDelete,
  type MassDeleteAnswer,
  type SyncWarning,
} from "./state";
import type { Transport } from "./transport";

export type SyncContext = {
  env: SyncEnv;
  transport: Transport;
  // Identifies the backend (type, URL, user), whose caches the round uses.
  scope: string;
  device: string;
  settings: SyncGroupSettings;
};

export type RoundReason =
  "edit" | "poll" | "open" | "startup" | "manual" | "remote";

export type RoundResult = {
  pending: number;
  // Records left for later (a reply still streaming).
  held: number;
  checked: boolean;
  // A root write succeeded.
  wrote: boolean;
  warnings: SyncWarning[];
  massDelete?: MassDelete[];
  // The keys group as the last root read showed it.
  keys?: KeysStatus;
};

export type KeysStatus = { onServer: boolean; unlocked: boolean };

const MAX_WRITE_ATTEMPTS = 4;
const WRITE_RETRY_BASE_MS = 100;
const WRITE_RETRY_JITTER_MS = 400;

// One sync round: read local data with its clocks, read the root (one
// conditional GET), apply what others changed, upload new blobs and write the
// merged root with If-Match, merging again when another device wrote first.
export type RoundOptions = {
  massDelete?: MassDeleteAnswer | MassDeleteAnswer[];
};

export function runSyncRound(
  context: SyncContext,
  reason: RoundReason,
  options: RoundOptions = {},
): Promise<RoundResult> {
  return context.env.lock(SYNC_LOCK, () => round(context, reason, options));
}

async function round(
  given: SyncContext,
  reason: RoundReason,
  options: RoundOptions,
): Promise<RoundResult> {
  let context = given;
  const { env, transport } = context;
  let { device } = context;
  const collections = enabledCollections(
    context.settings,
    transport.capabilities,
  );
  const state = await loadSyncState(env.local, context.scope);
  const payloads: Payloads = new Map();
  const snapshot = await readLocal(env, device, collections, payloads);
  const result: RoundResult = {
    pending: countWaiting(snapshot, state.remote?.root),
    held: snapshot.held.size,
    checked: false,
    wrote: false,
    warnings: [],
  };
  // An edit that changed nothing to upload (or only a streaming reply)
  // needs no request.
  if (reason === "edit" && !result.pending) return result;

  // Blobs a root this device saw named: one uploaded again may be the one
  // another device is collecting at that moment.
  const seen = storedBlobs(state.remote?.root ?? emptyRoot());
  try {
    for (let attempt = 1; ; attempt++) {
      const sentEtag = state.remote?.etag;
      const read = await transport.readRoot(sentEtag);
      result.checked = true;
      // The root as stored (sealed keys), and its validator.
      let raw: Root;
      let etag: string | undefined;
      let damaged = false;
      if (read.status === "unchanged") {
        raw = state.remote!.root;
        etag = sentEtag;
        // A refused If-Match on a root the server still calls unchanged: its
        // ETags cannot be used for safe writes (an Apache "-gzip" ETag, say).
        if (attempt > 1) {
          result.warnings.push(SYNC_WARNINGS.unreliableEtags);
          break;
        }
      } else if (read.status === "missing") {
        raw = emptyRoot();
      } else if (read.status === "damaged") {
        // Rebuilt from the copy of the root it replaced, if that is good,
        // and from what this device holds; the write below repairs it.
        raw = read.previous ?? emptyRoot();
        etag = read.etag;
        damaged = true;
        if (read.reason === "unreadable")
          result.warnings.push(SYNC_WARNINGS.recoveredRoot);
      } else {
        raw = read.root;
        etag = read.etag;
        if (
          state.remote?.etag &&
          etag !== state.remote.etag &&
          canonicalJson(raw) === canonicalJson(state.remote.root)
        )
          result.warnings.push(SYNC_WARNINGS.unreliableEtags);
      }
      const keys = await roundKeys(env.local, context.scope, raw.keyring);
      const remote = await openRoot(raw, keys);
      const compared = keys.unlocked
        ? collections
        : collections.filter((collection) => !collection.encrypted);
      // Another install stamps changes with this id (a copied profile, a
      // restored backup): this one goes on under a new id.
      const issued = issuedClocks(snapshot.clocks.values());
      if (await observeRemote(env, remote, device, issued)) {
        device = await rotateDeviceId(env);
        context = { ...context, device };
        result.warnings.push(SYNC_WARNINGS.clonedDevice);
      }
      await settleSent(env, remote, snapshot, payloads);

      const outcome = await reconcile(
        context,
        compared,
        snapshot,
        remote,
        payloads,
        [options.massDelete ?? []].flat(),
      );
      result.warnings.push(...outcome.warnings);
      await updateEntries(
        env,
        outcome.accepted,
        snapshot,
        confirmedEntry,
        payloads,
      );
      result.keys = keysStatus(raw, keys, context.settings);
      if (outcome.massDelete) {
        result.massDelete = outcome.massDelete;
        state.remote = damaged ? undefined : { root: raw, etag };
        break;
      }
      const now = env.now();
      await localPayloads(env, remote, outcome.pushes, payloads);
      const merged = nextRoot(remote, device, outcome.pushes, now);
      const collected = dropExpiredGarbage(merged, now);
      const sealed = await sealRoot(merged, raw, keys);
      const next = sealed.root;
      if (!keysOn(next)) await removeLocalKeyring(env.local, context.scope);
      if (
        !outcome.pushes.size &&
        !collected.length &&
        !sealed.changed &&
        !damaged
      ) {
        state.remote = { root: raw, etag };
        break;
      }
      // Without a strong ETag an existing root cannot be replaced safely
      // (a damaged one has nothing left to lose).
      if (read.status !== "missing" && !etag && !damaged) {
        result.warnings.push(SYNC_WARNINGS.unreliableEtags);
        state.remote = { root: raw, etag };
        break;
      }
      const uploaded = await uploadBlobs(
        transport,
        remote,
        outcome.pushes,
        payloads,
      );
      await updateEntries(env, outcome.pushes, snapshot, sentEntry, payloads);
      const written = await transport.writeRoot(next, etag, {
        previous: damaged || read.status === "missing" ? undefined : raw,
        replace: damaged,
      });
      if (written.status === "ok") {
        state.remote = { root: next, etag: written.etag };
        result.keys = keysStatus(next, keys, context.settings);
        for (const hash of uploaded)
          if (seen.has(hash)) (state.uploads ??= {})[hash] = now;
        result.wrote = true;
        await deleteBlobs(transport, collected);
        break;
      }
      state.remote = damaged ? undefined : { root: raw, etag };
      for (const hash of storedBlobs(raw)) seen.add(hash);
      if (attempt >= MAX_WRITE_ATTEMPTS)
        throw new Error("Sync write conflict retries exhausted.");
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          WRITE_RETRY_BASE_MS + Math.random() * WRITE_RETRY_JITTER_MS * attempt,
        ),
      );
    }
    if (state.remote?.etag && !result.massDelete) {
      await checkUploads(env, transport, collections, state);
      if (
        transport.capabilities.listsBlobs &&
        env.now() - (state.lastSweepAt ??= env.now()) >=
          ORPHAN_SWEEP_INTERVAL_MS
      ) {
        const stored = await transport.listBlobs();
        await sweepOrphans(transport, state.remote.root, stored, env.now());
        await restoreLostBlobs(
          env,
          transport,
          collections,
          state.remote.root,
          stored,
        );
        state.lastSweepAt = env.now();
      }
    }
  } finally {
    // Caches only: a round that stops anywhere loses nothing without it.
    await saveSyncState(env.local, state);
  }
  result.pending = countWaiting(snapshot, state.remote?.root);
  result.warnings = [...new Set(result.warnings)];
  return result;
}

function keysStatus(
  root: Root,
  keys: RoundKeys,
  settings: SyncGroupSettings,
): KeysStatus | undefined {
  if (!settings[SYNC_GROUPS.keys] && !root.keyring) return undefined;
  return { onServer: !!root.keyring, unlocked: keys.unlocked };
}

// Records this device has to upload: changes newer than the remote copy,
// and records the remote never had.
export function countWaiting(
  snapshot: Pick<Snapshot, "copies" | "clocks"> & { held?: Set<string> },
  root: Root | undefined,
) {
  let count = 0;
  for (const recordId of new Set([
    ...snapshot.copies.keys(),
    ...snapshot.clocks.keys(),
  ])) {
    if (snapshot.held?.has(recordId)) continue;
    const entry = snapshot.clocks.get(recordId);
    const remote = root?.records[recordId];
    if (!entry) {
      if (snapshot.copies.get(recordId) && !remote) count++;
      continue;
    }
    const newer = !remote || compareClocks(entry.clock, remote.clock) > 0;
    if (entry.deleted ? newer && !!remote && !remote.deleted : newer) count++;
  }
  return count;
}

// Changes this device's root writes pushed, once a root read shows what
// became of them: a push the remote record includes (the same version, or
// one made from it) is confirmed, and what was changed here since is a
// change made from it. One another device's write replaced without it (a
// server that ignores If-Match) confirms nothing: the change stays a change
// from its old base and merges with the version that replaced it.
async function settleSent(
  env: SyncEnv,
  remote: Root,
  snapshot: Snapshot,
  bodies: Payloads,
) {
  const held = new Map<string, SyncRecord>();
  for (const [recordId, entry] of snapshot.clocks) {
    const now = remote.records[recordId];
    // The pushed version as a record (its data kept with it).
    if (entry.sent && now && includes(now, entry.sent.clock))
      held.set(recordId, entry.sent as SyncRecord);
  }
  await updateEntries(env, held, snapshot, confirmedEntry, bodies);
}

// Clock entries of records a round pushed or found confirmed: `change`
// gives each one's new entry, also in the snapshot the round goes on with.
// `bodies`: the round's bodies (a pushed version's is kept with its entry).
async function updateEntries(
  env: SyncEnv,
  records: Map<string, SyncRecord>,
  snapshot: Snapshot,
  change: (
    id: string,
    entry: ClockEntry,
    record: SyncRecord,
  ) => Promise<ClockEntry>,
  bodies: Payloads,
) {
  const byCollection = new Map<string, Array<[string, SyncRecord]>>();
  for (const [recordId, record] of records) {
    const { collection, id } = splitRecordId(recordId);
    byCollection.set(collection, [
      ...(byCollection.get(collection) ?? []),
      [id, record],
    ]);
  }
  for (const [collection, list] of byCollection)
    await env.lock(CLOCK_LOCK, async () => {
      const clocks: Clocks = await loadClocks(env.local, collection);
      for (const [id, record] of list) {
        // Cleared here meanwhile: nothing to update.
        if (clocks[id]) clocks[id] = await change(id, clocks[id], record);
        const recordId = `${collection}/${id}`;
        const read = snapshot.clocks.get(recordId);
        if (read) snapshot.clocks.set(recordId, await change(id, read, record));
      }
      await saveClocks(env, syncCollection(collection)!, clocks, { bodies });
    });
}

// Bodies of blobs to upload that this round did not read come from local
// data. A push whose blob is neither on the server nor here waits: a changed
// body that is gone meanwhile is compared again next round, and a record
// this device holds no content of (a chat it never opened, re-uploaded after
// the cloud was cleared) is left to a device that has the content, so no
// root ever refers to content nobody can download.
async function localPayloads(
  env: SyncEnv,
  remote: Root,
  pushes: Map<string, SyncRecord>,
  payloads: Payloads,
) {
  const present = storedBlobs(remote);
  const missing = [...pushes].filter(
    ([, record]) =>
      record.blob && !present.has(record.blob) && !payloads.has(record.blob),
  );
  const byCollection = new Map<string, Set<string>>();
  for (const [recordId] of missing) {
    const { collection, id } = splitRecordId(recordId);
    byCollection.set(
      collection,
      (byCollection.get(collection) ?? new Set()).add(id),
    );
  }
  for (const [name, ids] of byCollection) {
    const collection = syncCollection(name)!;
    const entries = await collection.read(env, (id) => ids.has(id));
    for (const id of ids) {
      const entry = entries.get(id);
      if (entry?.body !== undefined)
        await project(collection, entry, undefined, payloads);
    }
  }
  for (const [recordId, record] of missing) {
    const payload = payloads.get(record.blob!);
    if (!payload) pushes.delete(recordId);
    else if (record.size === undefined) record.size = payload.length;
  }
}

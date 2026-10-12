import { SYNC_LOCK } from "../locks";
import {
  STORAGE_KEYS,
  SYNC_DATA_SETTING_KEYS,
  SYNC_PREFERENCES,
  type SyncDataSettings,
} from "../storage-keys";
import {
  bodyFor,
  deleteBlobs,
  dropExpiredGarbage,
  nextRoot,
  ORPHAN_SWEEP_INTERVAL_MS,
  restoreLostBlobs,
  storedBlobs,
  sweepOrphans,
  uploadBlobs,
} from "./blobs";
import { canonicalJson, hashJson } from "./codec";
import type { Collection } from "./collection";
import {
  recordIdOf,
  SYNC_COLLECTIONS,
  syncCollection,
  splitRecordId,
} from "./collections";
import { readKey, type SyncEnv } from "./env";
import { compareClocks, observeClock } from "./hlc";
import {
  applyToLocal,
  collectLocalChanges,
  idsWithPrefix,
  project,
  versionOf,
  type LocalWrite,
  type Payloads,
  type Projection,
} from "./local";
import { decide, type Decision } from "./plan";
import {
  keepLocalCopies,
  localBodies,
  massDeletes,
  mergeRecord,
} from "./engine-merge";
import { emptyRoot, maxRootClock, type Root, type SyncRecord } from "./root";
import {
  clearDirty,
  loadDirty,
  loadSyncState,
  saveSyncState,
  SYNC_WARNINGS,
  type MassDelete,
  type MassDeleteAnswer,
  type SyncState,
  type SyncWarning,
} from "./state";
import type { Transport } from "./transport";

export type SyncContext = {
  env: SyncEnv;
  transport: Transport;
  // Identifies the backend (type, URL, user); another scope starts over.
  scope: string;
  device: string;
  settings: SyncDataSettings;
};

export type RoundReason =
  "edit" | "poll" | "open" | "startup" | "manual" | "remote";

export type RoundResult = {
  pending: number;
  // Dirty keys left for later (a streaming reply).
  held: number;
  checked: boolean;
  // A root write succeeded.
  wrote: boolean;
  warnings: SyncWarning[];
  massDelete?: MassDelete[];
};

const MAX_WRITE_ATTEMPTS = 4;

export function enabledCollections(
  settings: SyncDataSettings,
  kind: Transport["kind"],
): Collection[] {
  return SYNC_COLLECTIONS.filter((collection) => {
    if (kind === "browser-sync" && !collection.browserSync) return false;
    if (collection.gate === "always") return true;
    if (collection.gate === "attachments")
      return (
        settings[SYNC_PREFERENCES.chats] &&
        settings[SYNC_DATA_SETTING_KEYS.chatAttachments]
      );
    return settings[collection.gate];
  });
}

// One sync round: stamp local changes, read the root (one conditional GET),
// apply what others changed, upload new blobs and write the merged root with
// If-Match, merging again when another device wrote first.
export type RoundOptions = { massDelete?: MassDeleteAnswer };

export function runSyncRound(
  context: SyncContext,
  reason: RoundReason,
  options: RoundOptions = {},
): Promise<RoundResult> {
  return context.env.lock(SYNC_LOCK, () => round(context, reason, options));
}

async function round(
  context: SyncContext,
  reason: RoundReason,
  options: RoundOptions,
): Promise<RoundResult> {
  const { env, transport, device } = context;
  const collections = enabledCollections(context.settings, transport.kind);
  const state = await loadSyncState(env.local, context.scope);
  // Local data changed while another backend was active is compared in full.
  const lastScope = await readKey<string>(env.local, STORAGE_KEYS.syncScope);
  if (lastScope !== context.scope)
    state.rescan = SYNC_COLLECTIONS.map((collection) => collection.name);
  const dirty = await loadDirty(env.local);
  const payloads: Payloads = new Map();
  const scan = await collectLocalChanges(
    env,
    state,
    collections,
    dirty,
    device,
    payloads,
  );
  state.rescan = state.rescan.filter(
    (name) => !collections.some((collection) => collection.name === name),
  );
  await saveSyncState(env.local, state);
  if (lastScope !== context.scope)
    await env.local.set({ [STORAGE_KEYS.syncScope]: context.scope });
  await clearDirty(
    env,
    dirty,
    [...scan.processed].filter((key) => !scan.held.has(key)),
  );
  const result: RoundResult = {
    pending: Object.keys(state.pending).length,
    held: scan.held.size,
    checked: false,
    wrote: false,
    warnings: [],
  };
  // An edit that changed nothing syncable (or only a streaming reply) needs
  // no request.
  if (reason === "edit" && !result.pending) return result;

  for (let attempt = 1; ; attempt++) {
    const sentEtag = state.remote?.etag;
    const read = await transport.readRoot(sentEtag);
    result.checked = true;
    let remote: Root;
    let etag: string | undefined;
    if (read.status === "unchanged") {
      remote = state.remote!.root;
      etag = sentEtag;
      // A refused If-Match on a root the server still calls unchanged: its
      // ETags cannot be used for safe writes (an Apache "-gzip" ETag, say).
      if (attempt > 1) {
        result.warnings.push(SYNC_WARNINGS.unreliableEtags);
        break;
      }
    } else if (read.status === "missing") {
      remote = emptyRoot();
    } else {
      remote = read.root;
      etag = read.etag;
      if (
        state.remote?.etag &&
        etag !== state.remote.etag &&
        canonicalJson(remote) === canonicalJson(state.remote.root)
      )
        result.warnings.push(SYNC_WARNINGS.unreliableEtags);
    }
    const remoteMax = maxRootClock(remote);
    if (remoteMax) state.hlc = observeClock(state.hlc, remoteMax);

    const outcome = await reconcile(
      context,
      collections,
      state,
      remote,
      scan.local,
      payloads,
      options.massDelete,
    );
    result.warnings.push(...outcome.warnings);
    if (outcome.massDelete) {
      result.massDelete = outcome.massDelete;
      break;
    }
    const now = env.now();
    await localPayloads(env, remote, outcome.pushes, payloads);
    const next = nextRoot(remote, device, outcome.pushes, now);
    const collected = dropExpiredGarbage(next, now);
    if (!outcome.pushes.size && !collected.length) {
      state.remote = { root: remote, etag };
      break;
    }
    // Without a strong ETag an existing root cannot be replaced safely.
    if (read.status !== "missing" && !etag) {
      result.warnings.push(SYNC_WARNINGS.unreliableEtags);
      state.remote = { root: remote, etag };
      break;
    }
    await uploadBlobs(transport, remote, outcome.pushes, payloads);
    const written = await transport.writeRoot(next, etag);
    if (written.status === "ok") {
      for (const [recordId, record] of outcome.pushes) {
        state.synced[recordId] = await versionOf(record);
        if (state.pending[recordId]?.clock === record.clock)
          delete state.pending[recordId];
      }
      state.remote = { root: next, etag: written.etag };
      result.wrote = true;
      await deleteBlobs(transport, collected);
      break;
    }
    state.remote = { root: remote, etag };
    if (attempt >= MAX_WRITE_ATTEMPTS)
      throw new Error("Sync write conflict retries exhausted.");
    await new Promise((resolve) =>
      setTimeout(resolve, 100 + Math.random() * 400 * attempt),
    );
  }
  if (
    transport.kind === "webdav" &&
    state.remote?.etag &&
    !result.massDelete &&
    env.now() - (state.lastSweepAt ??= env.now()) >= ORPHAN_SWEEP_INTERVAL_MS
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
  await saveSyncState(env.local, state);
  result.pending = Object.keys(state.pending).length;
  result.warnings = [...new Set(result.warnings)];
  return result;
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
  for (const [recordId, record] of missing)
    if (!payloads.has(record.blob!)) pushes.delete(recordId);
}

type Outcome = {
  pushes: Map<string, SyncRecord>;
  warnings: SyncWarning[];
  massDelete?: MassDelete[];
};

// Decide every record of the enabled collections, apply remote wins to
// local data, and return what to push.
async function reconcile(
  context: SyncContext,
  collections: Collection[],
  state: SyncState,
  remote: Root,
  local: Map<string, Projection | null>,
  payloads: Payloads,
  answer: MassDeleteAnswer | undefined,
): Promise<Outcome> {
  const { env, transport } = context;
  const outcome: Outcome = { pushes: new Map(), warnings: [] };
  const decisions = new Map<string, Decision>();
  for (const collection of collections) {
    const ids = new Set([
      ...idsWithPrefix(remote.records, collection),
      ...idsWithPrefix(state.synced, collection),
      ...idsWithPrefix(state.pending, collection),
    ]);
    // Records the remote root lost need this device's copy to re-upload.
    const lost = [...ids].filter((id) => {
      const recordId = recordIdOf(collection, id);
      const synced = state.synced[recordId];
      const theirs = remote.records[recordId];
      return (
        synced &&
        !synced.deleted &&
        !local.has(recordId) &&
        (!theirs || compareClocks(theirs.clock, synced.clock) < 0)
      );
    });
    if (lost.length) {
      const wanted = new Set(lost);
      const entries = await collection.read(env, (id) => wanted.has(id));
      for (const id of lost) {
        const entry = entries.get(id);
        const recordId = recordIdOf(collection, id);
        local.set(
          recordId,
          entry
            ? await project(collection, entry, state.synced[recordId], payloads)
            : null,
        );
      }
    }
    for (const id of ids) {
      const recordId = recordIdOf(collection, id);
      const synced = state.synced[recordId];
      const mine = local.get(recordId);
      decisions.set(
        recordId,
        await decide({
          synced,
          pending: state.pending[recordId],
          remote: remote.records[recordId],
          mergesContent: !!collection.mergeBodies,
          dataHash: hashJson,
          local:
            mine && synced
              ? {
                  clock: synced.clock,
                  data: mine.data,
                  blob: mine.blob,
                  size: mine.size,
                }
              : undefined,
        }),
      );
    }
  }

  const massDelete = massDeletes(collections, state, decisions, local);
  if (
    massDelete.some((entry) => !answer?.collections.includes(entry.collection))
  ) {
    outcome.massDelete = massDelete;
    return outcome;
  }
  if (answer?.keep && massDelete.length)
    await keepLocalCopies(
      context,
      massDelete.map((entry) => syncCollection(entry.collection)!),
      state,
      remote,
      decisions,
      local,
      payloads,
    );

  const writes = new Map<Collection, LocalWrite[]>();
  const addWrite = (collection: Collection, write: LocalWrite) =>
    writes.set(collection, [...(writes.get(collection) ?? []), write]);
  const merged = new Map<string, SyncRecord>();
  const heldLocally = await localBodies(env, collections, decisions);

  for (const [recordId, decision] of decisions) {
    const collection = syncCollection(splitRecordId(recordId).collection)!;
    if (decision.kind === "accept") {
      state.synced[recordId] = await versionOf(state.pending[recordId]);
      delete state.pending[recordId];
    } else if (decision.kind === "push")
      outcome.pushes.set(recordId, decision.record);
    else if (decision.kind === "apply") {
      const record = decision.record;
      let body: unknown;
      const needsBody =
        !record.deleted &&
        !!record.blob &&
        (!collection.lazy || heldLocally.has(recordId));
      if (needsBody) {
        const fetched = await bodyFor(
          transport,
          collection,
          record.blob!,
          payloads,
        );
        // Missing content is never a delete: the record waits.
        if (!fetched) {
          outcome.warnings.push(SYNC_WARNINGS.missingContent);
          continue;
        }
        body = fetched.body;
      }
      addWrite(collection, { recordId, record, body });
    } else if (decision.kind === "merge") {
      const record = await mergeRecord(
        context,
        collection,
        state,
        recordId,
        decision,
        payloads,
        remote.records[recordId]?.clock,
      );
      if (!record) {
        outcome.warnings.push(SYNC_WARNINGS.missingContent);
        continue;
      }
      merged.set(recordId, record.record);
      addWrite(collection, {
        recordId,
        record: record.record,
        body: record.body,
      });
    }
  }

  for (const [collection, list] of writes) {
    const written = await applyToLocal(env, collection, list, local, state);
    for (const write of list) {
      if (!written.has(write.recordId)) continue;
      const mergedRecord = merged.get(write.recordId);
      if (mergedRecord) {
        // The local copy is the merge, pending upload; the remote record it
        // merged stays the synced version until the upload lands.
        state.synced[write.recordId] = await versionOf(
          remote.records[write.recordId],
        );
        state.pending[write.recordId] = mergedRecord;
        outcome.pushes.set(write.recordId, mergedRecord);
      } else {
        state.synced[write.recordId] = await versionOf(write.record);
        delete state.pending[write.recordId];
      }
    }
  }
  return outcome;
}

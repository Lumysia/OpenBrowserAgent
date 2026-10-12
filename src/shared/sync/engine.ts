import { storageLockName } from "../locks";
import {
  STORAGE_KEYS,
  SYNC_DATA_SETTING_KEYS,
  SYNC_PREFERENCES,
  type SyncDataSettings,
} from "../storage-keys";
import {
  bodyFor,
  collectGarbage,
  hasExpiredGarbage,
  nextRoot,
  ORPHAN_SWEEP_INTERVAL_MS,
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
import type { SyncEnv } from "./env";
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
import { localBodies, massDeletes, mergeRecord } from "./engine-merge";
import {
  emptyRoot,
  maxRootClock,
  referencedBlobs,
  type Root,
  type SyncRecord,
} from "./root";
import {
  loadDirty,
  loadSyncState,
  saveSyncState,
  SYNC_WARNINGS,
  type MassDelete,
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
export async function runSyncRound(
  context: SyncContext,
  reason: RoundReason,
  options: { allowMassDelete?: boolean } = {},
): Promise<RoundResult> {
  const { env, transport, device } = context;
  const collections = enabledCollections(context.settings, transport.kind);
  const state = await loadSyncState(env.local, context.scope);
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
  await clearDirty(env, dirty, scan);
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
      {
        allowMassDelete: !!options.allowMassDelete,
      },
    );
    result.warnings.push(...outcome.warnings);
    if (outcome.massDelete) {
      result.massDelete = outcome.massDelete;
      break;
    }
    const now = env.now();
    const collect = hasExpiredGarbage(remote, now);
    if (!outcome.pushes.size && !collect) {
      state.remote = { root: remote, etag };
      break;
    }
    // Without a strong ETag an existing root cannot be replaced safely.
    if (read.status !== "missing" && !etag) {
      result.warnings.push(SYNC_WARNINGS.unreliableEtags);
      state.remote = { root: remote, etag };
      break;
    }
    await localPayloads(env, state, remote, outcome.pushes, payloads);
    await uploadBlobs(transport, remote, outcome.pushes, payloads);
    const next = nextRoot(remote, device, outcome.pushes, now);
    if (collect) await collectGarbage(transport, next, now);
    const written = await transport.writeRoot(next, etag);
    if (written.status === "ok") {
      for (const [recordId, record] of outcome.pushes) {
        state.synced[recordId] = await versionOf(record);
        if (state.pending[recordId]?.clock === record.clock)
          delete state.pending[recordId];
      }
      state.remote = { root: next, etag: written.etag };
      result.wrote = true;
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
    await sweepOrphans(transport, state.remote.root, env.now());
    state.lastSweepAt = env.now();
  }
  await saveSyncState(env.local, state);
  result.pending = Object.keys(state.pending).length;
  result.warnings = [...new Set(result.warnings)];
  return result;
}

// Bodies of blobs to upload that this round did not read (a change stamped
// in an earlier round whose upload failed) come from local data. A changed
// body that is gone meanwhile waits for the next round; a body this device
// never held (it changed only the record's data, or re-uploads after the
// cloud was cleared) is referred to as it is.
async function localPayloads(
  env: SyncEnv,
  state: SyncState,
  remote: Root,
  pushes: Map<string, SyncRecord>,
  payloads: Payloads,
) {
  const present = referencedBlobs(remote);
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
    if (
      !payloads.has(record.blob!) &&
      state.pending[recordId]?.clock === record.clock &&
      record.blob !== state.synced[recordId]?.blob
    )
      pushes.delete(recordId);
}

// Remove the dirty keys this round compared, unless they changed again
// meanwhile or their change is held back.
async function clearDirty(
  env: SyncEnv,
  seen: Record<string, number>,
  scan: { processed: Set<string>; held: Set<string> },
) {
  const keys = [...scan.processed].filter((key) => !scan.held.has(key));
  if (!keys.length) return;
  await env.lock(storageLockName(STORAGE_KEYS.syncDirty), async () => {
    const current = await loadDirty(env.local);
    for (const key of keys) if (current[key] === seen[key]) delete current[key];
    await env.local.set({ [STORAGE_KEYS.syncDirty]: current });
  });
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
  options: { allowMassDelete: boolean },
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

  const massDelete = massDeletes(collections, state, decisions);
  if (massDelete.length && !options.allowMassDelete) {
    outcome.massDelete = massDelete;
    return outcome;
  }

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

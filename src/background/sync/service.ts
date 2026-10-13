import {
  deleteAttachment,
  getAttachment,
  putAttachment,
} from "../../shared/attachment-db";
import { deleteChatArtifacts } from "../../shared/artifacts";
import { getBrowserApi } from "../../shared/browser-api";
import {
  CLOCK_LOCK,
  storageLockName,
  SYNC_LOCK,
  withLock,
  withLocks,
} from "../../shared/locks";
import {
  mergeSyncDataSettings,
  STORAGE_KEYS,
  type SyncDataSettings,
} from "../../shared/storage-keys";
import {
  getActiveSyncBackendConfig,
  SYNC_BACKEND_TYPES,
  syncBackendScope,
} from "../../shared/sync-backends";
import {
  createBrowserSyncTransport,
  SyncNotReadyError,
  SyncQuotaError,
  type PartsSeen,
} from "../../shared/sync/browser-sync";
import { clocksKey, loadClocks } from "../../shared/sync/clocks";
import { ownsKey, type Collection } from "../../shared/sync/collection";
import { hashJson } from "../../shared/sync/codec";
import {
  recordIdOf,
  SYNC_COLLECTIONS,
  syncCollection,
} from "../../shared/sync/collections";
import { readKey, type StorageArea, type SyncEnv } from "../../shared/sync/env";
import {
  countWaiting,
  enabledCollections,
  runSyncRound,
  type RoundOptions,
  type RoundReason,
  type SyncContext,
} from "../../shared/sync/engine";
import { parseBody } from "../../shared/sync/blobs";
import { SyncFormatError } from "../../shared/sync/root";
import {
  loadSyncState,
  loadSyncStatus,
  newSyncState,
  saveSyncState,
  SYNC_WARNINGS,
  updateSyncStatus,
  type SyncStatus,
  type SyncWarning,
} from "../../shared/sync/state";
import { isRateLimit, type Transport } from "../../shared/sync/transport";
import { createWebDavTransport } from "../../shared/sync/webdav";
import type { SyncBackendConfig } from "../../shared/types";

// The one place that runs sync: rounds are serialized, a request made
// during a round runs once after it, and 429/503 pause everything.

const BACKOFF_START_MS = 60_000;
// Opening content keeps downloading newer versions while another device
// changes it, for this long and at most this often.
const LOAD_DEADLINE_MS = 60_000;
const LOAD_ATTEMPTS = 10;
const BACKOFF_MAX_MS = 60 * 60_000;
// Warnings about the server that outlive a round: missing ETags until a
// write succeeds, ignored preconditions until the backend changes (a
// successful write does not show that If-Match is honoured).
const KEPT_UNTIL_WRITE: SyncWarning[] = [SYNC_WARNINGS.unreliableEtags];
const KEPT: SyncWarning[] = [SYNC_WARNINGS.ignoresPreconditions];

// The pause after the `level`-th rate limit in a row: 1 min doubling to
// 1 h, or longer when the server's Retry-After says so.
export function pauseDuration(level: number, retryAfterMs = 0) {
  const backoff = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** (level - 1));
  return Math.max(backoff, retryAfterMs);
}

export function browserSyncEnv(): SyncEnv {
  const api = getBrowserApi();
  return {
    local: api.storage.local,
    sync: api.storage.sync,
    attachments: {
      get: getAttachment,
      put: putAttachment,
      delete: deleteAttachment,
    },
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
    lock: withLock,
    removeChatArtifacts: deleteChatArtifacts,
  };
}

export function transportFor(
  env: SyncEnv,
  backend: SyncBackendConfig,
): Transport {
  return backend.type === SYNC_BACKEND_TYPES.webDav
    ? createWebDavTransport(backend, env.fetch)
    : createBrowserSyncTransport(env.sync, env.now, storedPartsSeen(env.local));
}

const storedPartsSeen = (local: StorageArea): PartsSeen => ({
  load: async () =>
    (await readKey<Record<string, number>>(
      local,
      STORAGE_KEYS.syncPartsSeen,
    )) ?? {},
  save: (seen) => local.set({ [STORAGE_KEYS.syncPartsSeen]: seen }),
});

export async function syncDeviceId(env: SyncEnv) {
  const stored = await readKey<string>(env.local, STORAGE_KEYS.syncDeviceId);
  if (stored && /^[A-Za-z0-9_-]{1,64}$/.test(stored)) return stored;
  const id = crypto.randomUUID();
  await env.local.set({ [STORAGE_KEYS.syncDeviceId]: id });
  return id;
}

export async function syncContext(
  env: SyncEnv,
): Promise<SyncContext | undefined> {
  const backend = await getActiveSyncBackendConfig();
  if (!backend) return undefined;
  return {
    env,
    transport: transportFor(env, backend),
    scope: syncBackendScope(backend),
    device: await syncDeviceId(env),
    settings: mergeSyncDataSettings(
      await readKey<Partial<SyncDataSettings>>(
        env.local,
        STORAGE_KEYS.syncDataSettings,
      ),
    ),
  };
}

// Changes waiting to upload in the collections this backend syncs: records
// whose clock is newer than the last root seen.
export async function countPending(env: SyncEnv, context: SyncContext) {
  const root = (await loadSyncState(env.local, context.scope)).remote?.root;
  const collections = enabledCollections(
    context.settings,
    context.transport.kind,
  );
  const clocks = new Map();
  for (const collection of collections)
    for (const [id, entry] of Object.entries(
      await loadClocks(env.local, collection.name),
    ))
      clocks.set(recordIdOf(collection, id), entry);
  return countWaiting({ copies: new Map(), clocks }, root);
}

export type RoundRequest = { reason: RoundReason } & RoundOptions;

export function createSyncRunner(
  env: SyncEnv,
  onPaused: (until: number) => void,
  resolveContext: (
    env: SyncEnv,
  ) => Promise<SyncContext | undefined> = syncContext,
) {
  let running: Promise<void> | undefined;
  let queued: RoundRequest | undefined;

  async function round({ reason, ...options }: RoundRequest) {
    const status = await loadSyncStatus(env.local);
    const now = env.now();
    if (status.pausedUntil && status.pausedUntil > now) return;
    const context = await resolveContext(env);
    if (!context) {
      await updateSyncStatus(env.local, {
        running: undefined,
        pendingCount: 0,
      });
      return;
    }
    await updateSyncStatus(env.local, { running: true });
    try {
      const result = await runSyncRound(context, reason, options);
      // Read again: the server check may have added warnings meanwhile.
      const latest = await loadSyncStatus(env.local);
      const sticky = latest.warnings.filter(
        (warning) =>
          KEPT.includes(warning) ||
          (!result.wrote && KEPT_UNTIL_WRITE.includes(warning)),
      );
      await updateSyncStatus(env.local, {
        running: undefined,
        ...(result.checked ? { lastCheckAt: env.now() } : {}),
        ...(result.checked && !result.massDelete
          ? { lastSyncAt: env.now() }
          : {}),
        pendingCount: await countPending(env, context),
        error: undefined,
        pausedUntil: undefined,
        pauseStatus: undefined,
        backoffLevel: undefined,
        warnings: [...new Set([...sticky, ...result.warnings])],
        massDelete: result.massDelete,
      });
    } catch (error) {
      await recordFailure(error, status);
    }
  }

  async function recordFailure(error: unknown, status: SyncStatus) {
    if (error instanceof SyncNotReadyError) {
      await updateSyncStatus(env.local, { running: undefined });
      return;
    }
    if (isRateLimit(error)) {
      const level = (status.backoffLevel ?? 0) + 1;
      const until = env.now() + pauseDuration(level, error.retryAfterMs);
      await updateSyncStatus(env.local, {
        running: undefined,
        pausedUntil: until,
        pauseStatus: error.status,
        backoffLevel: level,
        error: error.message,
      });
      onPaused(until);
      return;
    }
    const warnings = [...status.warnings];
    if (error instanceof SyncFormatError && error.newerFormat)
      warnings.push(SYNC_WARNINGS.newerFormat);
    if (error instanceof SyncQuotaError) warnings.push(SYNC_WARNINGS.quota);
    await updateSyncStatus(env.local, {
      running: undefined,
      error: error instanceof Error ? error.message : String(error),
      warnings: [...new Set(warnings)],
    });
  }

  // Requests during a round are merged into one follow-up round.
  function request(next: RoundRequest): Promise<void> {
    if (running) {
      queued = {
        reason:
          queued?.reason === "edit" || !queued ? next.reason : queued.reason,
        massDelete: next.massDelete ?? queued?.massDelete,
      };
      return running;
    }
    running = round(next).finally(() => {
      running = undefined;
      const follow = queued;
      queued = undefined;
      if (follow) void request(follow);
    });
    return running;
  }

  return { request };
}

// Content this device has not held: download its blob now (a chat opened
// for the first time here, an attachment shown). Rounds are not waited for:
// the content is stored only if it is still the version the local copy's
// clock records, so a round that moved on meanwhile is never undone.
export async function loadContent(
  context: SyncContext | undefined,
  collectionName: string,
  id: string,
) {
  const collection = syncCollection(collectionName);
  if (!collection?.lazy || !context) return false;
  const { env } = context;
  const start = env.now();
  let previous: string | undefined;
  for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt++) {
    const status = await loadSyncStatus(env.local);
    if (status.pausedUntil && status.pausedUntil > env.now()) return false;
    const blob = (await loadClocks(env.local, collection.name))[id]?.blob;
    // No newer version arrived since the last try, or out of time.
    if (!blob || blob === previous || env.now() - start > LOAD_DEADLINE_MS)
      return false;
    previous = blob;
    const payload = await context.transport.getBlob(blob);
    if (!payload) return false;
    const stored = await storeContent(
      env,
      collection,
      id,
      parseBody(collection, payload),
      blob,
    );
    if (stored !== undefined) return stored;
  }
  return false;
}

// Store a body under the chat or file it belongs to, unless the local copy
// changed meanwhile. Resolves whether a body is stored now; undefined when
// the record moved on to another version.
async function storeContent(
  env: SyncEnv,
  collection: Collection,
  id: string,
  body: unknown,
  blob: string,
) {
  const read = async () =>
    (await collection.read(env, (other) => other === id)).get(id);
  const current = await read();
  if (!current) return false;
  if (current.body !== undefined) return true;
  const dataHash = await hashJson(current.data);
  let movedOn = false;
  const written = await collection.write(
    env,
    [{ id, entry: { data: current.data, body } }],
    {
      step: (run) => env.lock(CLOCK_LOCK, run),
      async verify(_id, now) {
        if (!now || now.body !== undefined) return false;
        if ((await loadClocks(env.local, collection.name))[id]?.blob !== blob) {
          movedOn = true;
          return false;
        }
        return (await hashJson(now.data)) === dataHash;
      },
    },
  );
  if (movedOn) return undefined;
  return written.has(id) || (await read())?.body !== undefined;
}

// Delete everything on the server (every device's data is uploaded again
// by its next round), and remove local keys (chat contents with the chat
// list) together with the clocks of what they held, in one storage call:
// the cleared data counts as never changed here, so it is downloaded again
// instead of deleted everywhere. Holds the sync lock, so it runs between
// rounds; works with sync off too.
export function resetSync(
  env: SyncEnv,
  context: SyncContext | undefined,
  remote: boolean,
  keys: string[],
) {
  return env.lock(SYNC_LOCK, () => reset(env, context, remote, keys));
}

async function reset(
  env: SyncEnv,
  context: SyncContext | undefined,
  remote: boolean,
  keys: string[],
) {
  if (context && remote) {
    await context.transport.clear();
    await saveSyncState(env.local, newSyncState(context.scope));
  }
  if (!keys.length) return;
  const cleared = SYNC_COLLECTIONS.filter((collection) =>
    keys.some((key) => ownsKey(collection, key)),
  );
  const contents = keys.includes(STORAGE_KEYS.chats)
    ? Object.keys(await env.local.get(null)).filter((key) =>
        key.startsWith(`${STORAGE_KEYS.chats}/`),
      )
    : [];
  // Under the keys' own locks too, so an app read-modify-write that read
  // them before the clear does not store their old values after it.
  const removed = [...keys, ...contents];
  await withLocks(env.lock, removed.map(storageLockName), () =>
    env.lock(CLOCK_LOCK, () =>
      env.local.remove([
        ...removed,
        ...cleared.map((collection) => clocksKey(collection.name)),
      ]),
    ),
  );
}

export async function checkBackend(env: SyncEnv, backend: SyncBackendConfig) {
  return transportFor(env, backend).check();
}

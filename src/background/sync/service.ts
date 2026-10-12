import {
  deleteAttachment,
  getAttachment,
  putAttachment,
} from "../../shared/attachment-db";
import { deleteChatArtifacts } from "../../shared/artifacts";
import { getBrowserApi } from "../../shared/browser-api";
import { SYNC_LOCK, withLock } from "../../shared/locks";
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
} from "../../shared/sync/browser-sync";
import { ownsKey, type Collection } from "../../shared/sync/collection";
import { hashJson } from "../../shared/sync/codec";
import {
  recordIdOf,
  SYNC_COLLECTIONS,
  syncCollection,
} from "../../shared/sync/collections";
import { readKey, type SyncEnv } from "../../shared/sync/env";
import {
  enabledCollections,
  runSyncRound,
  type RoundOptions,
  type RoundReason,
  type SyncContext,
} from "../../shared/sync/engine";
import { parseBody } from "../../shared/sync/blobs";
import { SyncFormatError } from "../../shared/sync/root";
import {
  loadDirty,
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
// Downloads of content whose version moved on while it downloaded.
const LOAD_ATTEMPTS = 3;
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
    : createBrowserSyncTransport(env.sync);
}

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

// Changes waiting to upload: stamped records plus changed keys of the
// collections that sync with this backend, not yet compared.
export async function countPending(env: SyncEnv, context: SyncContext) {
  const state = await loadSyncState(env.local, context.scope);
  const collections = enabledCollections(
    context.settings,
    context.transport.kind,
  );
  const dirty = Object.keys(await loadDirty(env.local)).filter((key) =>
    collections.some((collection) => ownsKey(collection, key)),
  );
  return Object.keys(state.pending).length + dirty.length;
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
// for the first time here, an attachment shown). The download runs outside
// the sync lock; the content is stored only if it is still the version this
// device's copy is synced to, since a round may have moved on meanwhile.
export async function loadContent(
  context: SyncContext | undefined,
  collectionName: string,
  id: string,
) {
  const collection = syncCollection(collectionName);
  if (!collection?.lazy || !context) return false;
  const { env } = context;
  const recordId = recordIdOf(collection, id);
  for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt++) {
    const status = await loadSyncStatus(env.local);
    if (status.pausedUntil && status.pausedUntil > env.now()) return false;
    const state = await loadSyncState(env.local, context.scope);
    const blob = state.synced[recordId]?.blob;
    if (!blob) return false;
    const payload = await context.transport.getBlob(blob);
    if (!payload) return false;
    const body = parseBody(collection, payload);
    const stored = await env.lock(SYNC_LOCK, async () => {
      const latest = await loadSyncState(env.local, context.scope);
      if (latest.synced[recordId]?.blob !== blob) return undefined;
      return storeContent(env, collection, id, body);
    });
    if (stored !== undefined) return stored;
  }
  return false;
}

// Store a body under the chat or file it belongs to, unless the local copy
// changed meanwhile. Resolves whether a body is stored now.
async function storeContent(
  env: SyncEnv,
  collection: Collection,
  id: string,
  body: unknown,
) {
  const read = async () =>
    (await collection.read(env, (other) => other === id)).get(id);
  const current = await read();
  if (!current) return false;
  if (current.body !== undefined) return true;
  const dataHash = await hashJson(current.data);
  const written = await collection.write(
    env,
    [{ id, entry: { data: current.data, body } }],
    async (_id, now) =>
      !!now &&
      now.body === undefined &&
      (await hashJson(now.data)) === dataHash,
  );
  return written.has(id) || (await read())?.body !== undefined;
}

// Delete everything on the server (this device's data is uploaded again on
// its next round, as any other device's would be), and remove local keys
// (chat contents with the chat list) after forgetting what was synced for
// them, so the cleared data comes back from the server instead of being
// deleted there. Holds the sync lock, so it runs between rounds.
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
  const prefixes = SYNC_COLLECTIONS.filter((collection) =>
    keys.some((key) => ownsKey(collection, key)),
  ).map((collection) => `${collection.name}/`);
  if (context && prefixes.length) {
    const state = await loadSyncState(env.local, context.scope);
    for (const map of [state.synced, state.pending])
      for (const recordId of Object.keys(map))
        if (prefixes.some((prefix) => recordId.startsWith(prefix)))
          delete map[recordId];
    await saveSyncState(env.local, state);
  }
  const stored = Object.keys(await env.local.get(null));
  const contents = keys.includes(STORAGE_KEYS.chats)
    ? stored.filter((key) => key.startsWith(`${STORAGE_KEYS.chats}/`))
    : [];
  await env.local.remove([...keys, ...contents]);
}

export async function checkBackend(env: SyncEnv, backend: SyncBackendConfig) {
  return transportFor(env, backend).check();
}

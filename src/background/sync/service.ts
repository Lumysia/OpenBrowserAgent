import {
  deleteAttachment,
  getAttachment,
  putAttachment,
} from "../../shared/attachment-db";
import { deleteChatArtifacts } from "../../shared/artifacts";
import { getBrowserApi } from "../../shared/browser-api";
import { withLock } from "../../shared/locks";
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
import { ownsKey } from "../../shared/sync/collection";
import {
  recordIdOf,
  SYNC_COLLECTIONS,
  syncCollection,
} from "../../shared/sync/collections";
import { readKey, type SyncEnv } from "../../shared/sync/env";
import {
  runSyncRound,
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
const BACKOFF_MAX_MS = 60 * 60_000;
// Warnings about the server that stay until a write proves otherwise.
const STICKY_WARNINGS: SyncWarning[] = [
  SYNC_WARNINGS.unreliableEtags,
  SYNC_WARNINGS.ignoresPreconditions,
];

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

export type RoundRequest = { reason: RoundReason; allowMassDelete?: boolean };

export function createSyncRunner(
  env: SyncEnv,
  onPaused: (until: number) => void,
) {
  let running: Promise<void> | undefined;
  let queued: RoundRequest | undefined;

  async function round({ reason, allowMassDelete }: RoundRequest) {
    const status = await loadSyncStatus(env.local);
    const now = env.now();
    if (status.pausedUntil && status.pausedUntil > now) return;
    const context = await syncContext(env);
    if (!context) {
      await updateSyncStatus(env.local, {
        running: undefined,
        pendingCount: 0,
      });
      return;
    }
    await updateSyncStatus(env.local, { running: true });
    try {
      const result = await runSyncRound(context, reason, { allowMassDelete });
      const sticky = result.wrote
        ? []
        : status.warnings.filter((warning) =>
            STICKY_WARNINGS.includes(warning),
          );
      const dirty = Object.keys(await loadDirty(env.local)).length;
      await updateSyncStatus(env.local, {
        running: undefined,
        ...(result.checked ? { lastCheckAt: env.now() } : {}),
        ...(result.checked && !result.massDelete
          ? { lastSyncAt: env.now() }
          : {}),
        pendingCount: result.pending + Math.max(dirty, result.held),
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
        allowMassDelete: queued?.allowMassDelete || next.allowMassDelete,
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

  return { request, idle: () => running ?? Promise.resolve() };
}

// Content this device has not held: download its blob now (a chat opened
// for the first time here, an attachment shown).
export async function loadContent(
  env: SyncEnv,
  collectionName: string,
  id: string,
) {
  const collection = syncCollection(collectionName);
  const context = await syncContext(env);
  if (!collection?.lazy || !context) return false;
  const status = await loadSyncStatus(env.local);
  if (status.pausedUntil && status.pausedUntil > env.now()) return false;
  const state = await loadSyncState(env.local, context.scope);
  const blob = state.synced[recordIdOf(collection, id)]?.blob;
  if (!blob) return false;
  const payload = await context.transport.getBlob(blob);
  if (!payload) return false;
  const body = parseBody(collection, payload);
  const current = (await collection.read(env, (other) => other === id)).get(id);
  if (!current) return false;
  if (current.body !== undefined) return true;
  const stored = await collection.write(
    env,
    [{ id, entry: { data: current.data, body } }],
    async (_id, now) => !!now && now.body === undefined,
  );
  return stored.has(id);
}

// Delete everything on the server (this device's data is uploaded again on
// its next round, as any other device's would be), and remove local keys
// (chat contents with the chat list) after forgetting what was synced for
// them, so the cleared data comes back from the server instead of being
// deleted there. Runs between rounds.
export async function resetSync(env: SyncEnv, remote: boolean, keys: string[]) {
  const context = await syncContext(env);
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

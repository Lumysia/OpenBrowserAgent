import * as config from "./config";
import { getBrowserApi } from "./browser-api";
import type { SyncBackend } from "./sync-backends";
import { STORAGE_KEYS } from "./storage-keys";
import { sameStorageValue } from "./storage-value";

export type SyncWriteStatus = {
  pendingCount: number;
  pendingItems?: SyncWriteStatusItem[];
  lastUpdatedAt?: number;
  lastFlushedAt?: number;
  lastError?: string;
};

export type SyncWriteStatusItem = {
  key: string;
  operation: "write" | "remove";
  backendName: string;
  backendType: SyncBackend["config"]["type"];
};

type PendingSyncWrite = {
  timeoutId: ReturnType<typeof setTimeout>;
  backend: SyncBackend;
  operation: "write" | "remove";
  value: unknown;
  resolve: Array<() => void>;
  reject: Array<(error: unknown) => void>;
  flushing?: Promise<void>;
};

export type SyncLocalCache<T> = {
  value: T;
  updatedAt: number;
  flushedAt?: number;
};

const pendingSyncWrites = new Map<string, PendingSyncWrite>();

export const DEFAULT_SYNC_WRITE_STATUS: SyncWriteStatus = { pendingCount: 0 };

export async function queueSyncWrite<T>(
  backend: SyncBackend,
  key: string,
  value: T,
  options: { delayMs?: number } = {},
) {
  await new Promise<void>((resolve, reject) => {
    const delayMs = options.delayMs ?? config.SYNC_WRITE_DEBOUNCE_MS;
    const pending = pendingSyncWrites.get(key);
    if (pending && !pending.flushing) {
      clearTimeout(pending.timeoutId);
      pending.backend = backend;
      pending.operation = "write";
      pending.value = value;
      pending.resolve.push(resolve);
      pending.reject.push(reject);
      pending.timeoutId = syncWriteTimeout(key, delayMs);
      updateSyncWriteStatus().catch(() => undefined);
      return;
    }

    setPendingSyncWrite(key, pending, {
      backend,
      operation: "write",
      value,
      resolve: [resolve],
      reject: [reject],
      timeoutId: syncWriteTimeout(key, delayMs, pending),
    });
    updateSyncWriteStatus().catch(() => undefined);
  });
}

export async function queueSyncRemove(
  backend: SyncBackend,
  key: string,
  options: { delayMs?: number } = {},
) {
  await new Promise<void>((resolve, reject) => {
    const delayMs = options.delayMs ?? config.SYNC_WRITE_DEBOUNCE_MS;
    const pending = pendingSyncWrites.get(key);
    if (pending && !pending.flushing) {
      clearTimeout(pending.timeoutId);
      pending.backend = backend;
      pending.operation = "remove";
      pending.value = undefined;
      pending.resolve.push(resolve);
      pending.reject.push(reject);
      pending.timeoutId = syncWriteTimeout(key, delayMs);
      updateSyncWriteStatus().catch(() => undefined);
      return;
    }

    setPendingSyncWrite(key, pending, {
      backend,
      operation: "remove",
      value: undefined,
      resolve: [resolve],
      reject: [reject],
      timeoutId: syncWriteTimeout(key, delayMs, pending),
    });
    updateSyncWriteStatus().catch(() => undefined);
  });
}

function setPendingSyncWrite(
  key: string,
  previous: PendingSyncWrite | undefined,
  next: PendingSyncWrite,
) {
  pendingSyncWrites.set(key, next);
  if (!previous?.flushing) return;
  next.flushing = previous.flushing.then(() => {
    if (pendingSyncWrites.get(key) !== next) return;
    next.flushing = undefined;
  });
}

function syncWriteTimeout(
  key: string,
  delayMs: number,
  previous?: PendingSyncWrite,
) {
  return setTimeout(() => {
    const waitFor = previous?.flushing;
    if (waitFor) {
      waitFor.finally(() => scheduleIdleSyncWrite(key));
      return;
    }
    scheduleIdleSyncWrite(key);
  }, delayMs);
}

function scheduleIdleSyncWrite(key: string) {
  if (typeof requestIdleCallback !== "function") {
    flushSyncWrite(key);
    return;
  }
  requestIdleCallback(() => flushSyncWrite(key), {
    timeout: config.SYNC_WRITE_IDLE_TIMEOUT_MS,
  });
}

export function syncLocalCacheKey(key: string) {
  return `${key}:sync-local-cache`;
}

export function clearPendingSyncWrites() {
  for (const pending of pendingSyncWrites.values()) {
    clearTimeout(pending.timeoutId);
    pending.resolve.forEach((resolve) => resolve());
  }
  pendingSyncWrites.clear();
  updateSyncWriteStatus().catch(() => undefined);
}

export async function flushPendingSyncWrites() {
  while (pendingSyncWrites.size) {
    await Promise.allSettled(
      Array.from(pendingSyncWrites.keys()).map((key) => flushSyncWrite(key)),
    );
  }
}

export async function writeSyncLocalCache<T>(key: string, value: T) {
  await getBrowserApi().storage.local.set({
    [syncLocalCacheKey(key)]: {
      value,
      updatedAt: Date.now(),
    } satisfies SyncLocalCache<T>,
  });
}

export async function removeSyncLocalCache(key: string) {
  await getBrowserApi().storage.local.remove(syncLocalCacheKey(key));
}

export async function markSyncLocalCacheFlushed<T>(key: string, value: T) {
  const existing = await readSyncLocalCache<T>(key);
  if (
    existing?.flushedAt !== undefined &&
    sameStorageValue(existing.value, value)
  )
    return;
  const now = Date.now();
  await getBrowserApi().storage.local.set({
    [syncLocalCacheKey(key)]: {
      value,
      updatedAt: now,
      flushedAt: now,
    } satisfies SyncLocalCache<T>,
  });
}

export async function readPendingSyncValue<T>(key: string) {
  const cache = await readSyncLocalCache<T>(key);
  return cache && cache.flushedAt === undefined ? cache.value : undefined;
}

export async function readSyncLocalValue<T>(key: string) {
  return (await readSyncLocalCache<T>(key))?.value;
}

async function flushSyncWrite(key: string) {
  const pending = pendingSyncWrites.get(key);
  if (!pending) return;
  if (pending.flushing) {
    await pending.flushing;
    if (pendingSyncWrites.get(key) === pending) return flushSyncWrite(key);
    return;
  }
  clearTimeout(pending.timeoutId);
  pending.flushing = (async () => {
    try {
      if (pending.operation === "remove") {
        await pending.backend.remove(key);
      } else {
        const value = await pending.backend.write(key, pending.value);
        await markSyncLocalCacheFlushed(key, value ?? pending.value);
      }
      await updateSyncWriteStatus({ lastFlushedAt: Date.now(), lastError: "" });
      pending.resolve.forEach((resolve) => resolve());
    } catch (error) {
      await updateSyncWriteStatus({
        lastError: error instanceof Error ? error.message : String(error),
      });
      pending.reject.forEach((reject) => reject(error));
    } finally {
      if (pendingSyncWrites.get(key) === pending) pendingSyncWrites.delete(key);
      await updateSyncWriteStatus();
    }
  })();
  return pending.flushing;
}

async function readSyncLocalCache<T>(key: string) {
  const result = await getBrowserApi().storage.local.get(
    syncLocalCacheKey(key),
  );
  return result[syncLocalCacheKey(key)] as SyncLocalCache<T> | undefined;
}

async function updateSyncWriteStatus(patch: Partial<SyncWriteStatus> = {}) {
  await getBrowserApi().storage.local.set({
    [STORAGE_KEYS.syncWriteStatus]: {
      pendingCount: pendingSyncWrites.size,
      pendingItems: Array.from(pendingSyncWrites.entries()).map(
        ([key, pending]) => ({
          key,
          operation: pending.operation,
          backendName: pending.backend.config.name,
          backendType: pending.backend.config.type,
        }),
      ),
      lastUpdatedAt: Date.now(),
      ...patch,
    } satisfies SyncWriteStatus,
  });
}

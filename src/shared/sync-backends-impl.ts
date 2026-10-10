import * as config from "./config";
import {
  base64ToBytes,
  bytesToBase64,
  decodeTinyBaseSyncValue,
  readTinyBaseSyncValue,
  removeLocalTinyBaseSyncDocument,
  writeTinyBaseSyncValue,
} from "./sync-tinybase-doc";
import { getBrowserApi } from "./browser-api";
import { SYNC_BACKEND_TYPES } from "./sync-backend-registry";
import { STORAGE_AREAS } from "./storage-area-constants";
import type { SyncBackendConfig } from "./types";
import type {
  RemoteStorageChange,
  SyncBackend,
  SyncBackendImpl,
} from "./sync-backends";
import { registerSyncBackendImpl } from "./sync-backends";
import {
  serializeSyncBackend,
  syncBackendCacheKey,
} from "./sync-backend-operations";
import { createWebDavBackend } from "./sync-webdav-backend";
import {
  readWebDavObject,
  writeWebDavObject,
  removeWebDavObject,
} from "./sync-webdav-transport";

export { readWebDavObject, writeWebDavObject, removeWebDavObject };

export function createSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  return serializeSyncBackend(
    backendConfig.type === SYNC_BACKEND_TYPES.webDav
      ? createWebDavBackend(backendConfig)
      : createBrowserSyncBackend(backendConfig),
  );
}

export async function decodeSyncBackendChangeValue<T>(
  backendConfig: SyncBackendConfig,
  key: string,
  value: unknown,
) {
  if (backendConfig.type !== SYNC_BACKEND_TYPES.browserSync) return undefined;
  return decodeBrowserSyncChangeValue<T>(
    syncBackendCacheKey(backendConfig, key),
    value,
  );
}

function createBrowserSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  return {
    config: backendConfig,
    async read<T>(key: string, _cachedValue?: T) {
      const result = await getBrowserApi().storage.sync.get(key);
      const encoded = result[key] as string | undefined;
      return readTinyBaseSyncValue<T>(
        syncBackendCacheKey(backendConfig, key),
        encoded ? base64ToBytes(encoded) : undefined,
      );
    },
    async write<T>(key: string, value: T) {
      const stored = await getBrowserApi().storage.sync.get(key);
      const encoded = stored[key] as string | undefined;
      const result = await writeTinyBaseSyncValue(
        syncBackendCacheKey(backendConfig, key),
        value,
        encoded ? base64ToBytes(encoded) : undefined,
      );
      const nextValue = bytesToBase64(result.bytes);
      assertBrowserSyncItemFits(key, nextValue);
      if (nextValue !== encoded)
        await getBrowserApi().storage.sync.set({ [key]: nextValue });
      return result.value;
    },
    async remove(key) {
      await getBrowserApi().storage.sync.remove(key);
      await removeLocalTinyBaseSyncDocument(
        syncBackendCacheKey(backendConfig, key),
      );
    },
    async test() {
      await getBrowserApi().storage.sync.get(null);
    },
    watch<T>(key: string, callback: (change: RemoteStorageChange<T>) => void) {
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        changedArea: string,
      ) => {
        if (changedArea !== STORAGE_AREAS.sync || !changes[key]) return;
        const change = changes[key];
        Promise.all([
          decodeBrowserSyncChangeValue<T>(
            syncBackendCacheKey(backendConfig, key),
            change.newValue,
          ),
          decodeBrowserSyncChangeValue<T>(
            syncBackendCacheKey(backendConfig, key),
            change.oldValue,
          ),
        ])
          .then(([newValue, oldValue]) => callback({ newValue, oldValue }))
          .catch(() => undefined);
      };
      getBrowserApi().storage.onChanged.addListener(listener);
      return () => getBrowserApi().storage.onChanged.removeListener(listener);
    },
  };
}

async function decodeBrowserSyncChangeValue<T>(key: string, value: unknown) {
  return typeof value === "string"
    ? decodeTinyBaseSyncValue<T>(key, base64ToBytes(value))
    : undefined;
}

function assertBrowserSyncItemFits(key: string, value: unknown) {
  const size = new TextEncoder().encode(
    JSON.stringify({ [key]: value }),
  ).length;
  if (size <= config.SYNC_MAX_BYTES_PER_ITEM) return;
  throw new Error(
    `Sync item exceeds the safe per-item limit: "${key}" is ${size} bytes; limit is ${config.SYNC_MAX_BYTES_PER_ITEM} bytes. Keep this data local or use a backend without browser quota limits.`,
  );
}

registerSyncBackendImpl({
  createSyncBackend,
  decodeSyncBackendChangeValue,
  readWebDavObject,
  writeWebDavObject,
  removeWebDavObject,
} satisfies SyncBackendImpl);

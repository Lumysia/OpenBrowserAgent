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
  WebDavSyncBackendConfig,
} from "./sync-backends";
import { registerSyncBackendImpl } from "./sync-backends";

const webDavReadCaches = new Map<string, Map<string, WebDavReadCache>>();

export function createSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  if (backendConfig.type === SYNC_BACKEND_TYPES.webDav)
    return createWebDavBackend(backendConfig);
  return createBrowserSyncBackend(backendConfig);
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

function createWebDavBackend(
  backendConfig: WebDavSyncBackendConfig,
): SyncBackend {
  const readCache = webDavReadCacheFor(backendConfig);
  return {
    config: backendConfig,
    async read<T>(key: string, cachedValue?: T) {
      const cached = await readWebDavCache(backendConfig, key, readCache);
      const bytes = await readWebDavBytes(backendConfig, key, cached);
      if (bytes?.notModified)
        return cachedValue ?? (cached?.value as T | undefined);
      if (!bytes) {
        readCache.delete(key);
        await removeWebDavCache(backendConfig, key);
        return undefined;
      }
      const value = await readTinyBaseSyncValue<T>(
        syncBackendCacheKey(backendConfig, key),
        bytes.data,
      );
      readCache.set(key, {
        etag: bytes.etag,
        lastModified: bytes.lastModified,
        value,
      });
      await writeWebDavCache(backendConfig, key, bytes, value);
      return value;
    },
    async write<T>(key: string, value: T) {
      const bytes = await readWebDavBytes(
        backendConfig,
        key,
        await readWebDavCache(backendConfig, key, readCache),
      );
      const result = await writeTinyBaseSyncValue(
        syncBackendCacheKey(backendConfig, key),
        value,
        bytes && !bytes.notModified ? bytes.data : undefined,
      );
      const response = await requestWebDav(
        backendConfig,
        objectUrl(backendConfig, key),
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: bytesToArrayBuffer(result.bytes),
        },
      );
      if (!response.ok) await throwWebDavError(response, "write");
      readCache.set(key, {
        etag: response.headers.get("ETag") || undefined,
        lastModified: response.headers.get("Last-Modified") || undefined,
        value: result.value,
      });
      await writeWebDavCache(
        backendConfig,
        key,
        {
          etag: response.headers.get("ETag") || undefined,
          lastModified: response.headers.get("Last-Modified") || undefined,
        },
        result.value,
      );
      return result.value;
    },
    async remove(key) {
      const response = await requestWebDav(
        backendConfig,
        objectUrl(backendConfig, key),
        {
          method: "DELETE",
        },
      );
      if (!response.ok && response.status !== 404)
        await throwWebDavError(response, "remove");
      readCache.delete(key);
      await removeWebDavCache(backendConfig, key);
      await removeLocalTinyBaseSyncDocument(
        syncBackendCacheKey(backendConfig, key),
      );
    },
    async test() {
      const response = await requestWebDav(
        backendConfig,
        baseUrl(backendConfig),
        {
          method: "PROPFIND",
          headers: { Depth: "0" },
        },
      );
      if (!response.ok && response.status !== 207)
        await throwWebDavError(response, "test");
    },
  };
}

type WebDavReadCache = {
  etag?: string;
  lastModified?: string;
  value?: unknown;
};

type WebDavReadResult =
  | { notModified: true }
  | { data: Uint8Array; etag?: string; lastModified?: string };

function webDavReadCacheFor(backendConfig: WebDavSyncBackendConfig) {
  const scope = syncBackendCacheKey(backendConfig, "");
  let cache = webDavReadCaches.get(scope);
  if (!cache) {
    cache = new Map<string, WebDavReadCache>();
    webDavReadCaches.set(scope, cache);
  }
  return cache;
}

function webDavReadCacheKey(
  backendConfig: WebDavSyncBackendConfig,
  key: string,
) {
  return `${syncBackendCacheKey(backendConfig, key)}:webdav-read-cache`;
}

async function readWebDavCache(
  backendConfig: WebDavSyncBackendConfig,
  key: string,
  memoryCache: Map<string, WebDavReadCache>,
) {
  const cached = memoryCache.get(key);
  if (cached?.etag || cached?.lastModified) return cached;
  const result = await getBrowserApi().storage.local.get(
    webDavReadCacheKey(backendConfig, key),
  );
  const stored = result[webDavReadCacheKey(backendConfig, key)] as
    | WebDavReadCache
    | undefined;
  if (stored?.etag || stored?.lastModified) {
    memoryCache.set(key, stored);
    return stored;
  }
  return cached;
}

async function writeWebDavCache(
  backendConfig: WebDavSyncBackendConfig,
  key: string,
  cache: Pick<WebDavReadCache, "etag" | "lastModified">,
  value?: unknown,
) {
  if (!cache.etag && !cache.lastModified) return;
  const stored = {
    etag: cache.etag,
    lastModified: cache.lastModified,
  } satisfies WebDavReadCache;
  webDavReadCacheFor(backendConfig).set(key, { ...stored, value });
  await getBrowserApi().storage.local.set({
    [webDavReadCacheKey(backendConfig, key)]: stored,
  });
}

async function removeWebDavCache(
  backendConfig: WebDavSyncBackendConfig,
  key: string,
) {
  await getBrowserApi().storage.local.remove(
    webDavReadCacheKey(backendConfig, key),
  );
}

function syncBackendCacheKey(backendConfig: SyncBackendConfig, key: string) {
  const scope =
    backendConfig.type === SYNC_BACKEND_TYPES.webDav
      ? `${backendConfig.type}:${backendConfig.username || ""}:${backendConfig.url}`
      : backendConfig.id;
  return `${scope}:${key}`;
}

export async function readWebDavObject(
  backendConfig: WebDavSyncBackendConfig,
  name: string,
) {
  const response = await requestWebDav(
    backendConfig,
    rawObjectUrl(backendConfig, name),
    { method: "GET" },
  );
  if (response.status === 404) return undefined;
  if (!response.ok) await throwWebDavError(response, "read");
  return new Uint8Array(await response.arrayBuffer());
}

export async function writeWebDavObject(
  backendConfig: WebDavSyncBackendConfig,
  name: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
) {
  await ensureWebDavCollections(backendConfig, name);
  const response = await requestWebDav(
    backendConfig,
    rawObjectUrl(backendConfig, name),
    {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: bytesToArrayBuffer(bytes),
    },
  );
  if (!response.ok) await throwWebDavError(response, "write");
}

export async function removeWebDavObject(
  backendConfig: WebDavSyncBackendConfig,
  name: string,
) {
  const response = await requestWebDav(
    backendConfig,
    rawObjectUrl(backendConfig, name),
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404)
    await throwWebDavError(response, "remove");
}

async function ensureWebDavCollections(
  backendConfig: WebDavSyncBackendConfig,
  name: string,
) {
  const parts = name.split("/").filter(Boolean);
  if (parts.length <= 1) return;
  let currentPath = "";
  for (const part of parts.slice(0, -1)) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const response = await requestWebDav(
      backendConfig,
      rawObjectUrl(backendConfig, currentPath),
      { method: "MKCOL" },
    );
    if (!response.ok && response.status !== 405)
      await throwWebDavError(response, "create folder");
  }
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function readWebDavBytes(
  backendConfig: WebDavSyncBackendConfig,
  key: string,
  cached?: WebDavReadCache,
) {
  const headers: Record<string, string> = {};
  if (cached?.etag) headers["If-None-Match"] = cached.etag;
  if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;
  const response = await requestWebDav(
    backendConfig,
    objectUrl(backendConfig, key),
    {
      method: "GET",
      headers,
    },
  );
  if (response.status === 304 && cached) return { notModified: true } as const;
  if (response.status === 404) return undefined;
  if (!response.ok) await throwWebDavError(response, "read");
  return {
    data: new Uint8Array(await response.arrayBuffer()),
    etag: response.headers.get("ETag") || undefined,
    lastModified: response.headers.get("Last-Modified") || undefined,
  } satisfies WebDavReadResult;
}

function objectUrl(backendConfig: WebDavSyncBackendConfig, key: string) {
  return new URL(
    `${encodeURIComponent(key)}.tinybase`,
    baseUrl(backendConfig),
  ).toString();
}

function rawObjectUrl(backendConfig: WebDavSyncBackendConfig, name: string) {
  const encodedPath = name
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return new URL(encodedPath, baseUrl(backendConfig)).toString();
}

function baseUrl(backendConfig: WebDavSyncBackendConfig) {
  return backendConfig.url.endsWith("/")
    ? backendConfig.url
    : `${backendConfig.url}/`;
}

async function requestWebDav(
  backendConfig: WebDavSyncBackendConfig,
  url: string,
  init: RequestInit,
) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-cache");
  if (backendConfig.username || backendConfig.password) {
    const credentials = `${backendConfig.username || ""}:${backendConfig.password || ""}`;
    headers.set(
      "Authorization",
      `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(credentials)))}`,
    );
  }
  return fetch(url, { ...init, cache: "no-store", headers });
}

async function throwWebDavError(
  response: Response,
  action: string,
): Promise<never> {
  const body = await response.text().catch(() => "");
  throw new Error(
    `WebDAV ${action} failed: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 180)}` : ""}`,
  );
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

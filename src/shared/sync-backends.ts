import * as config from "./config";
import {
  base64ToBytes,
  bytesToBase64,
  readAutomergeValue,
  removeLocalAutomergeDocument,
  writeAutomergeValue,
} from "./automerge-sync-doc";
import { getBrowserApi } from "./browser-api";
import {
  BROWSER_SYNC_BACKEND_ID,
  NO_SYNC_BACKEND_ID,
  SYNC_BACKEND_TYPES,
  syncBackendDefaultName,
  WEBDAV_SYNC_BACKEND_ID,
} from "./sync-backend-registry";
import { STORAGE_AREAS } from "./storage-area-constants";
import { STORAGE_KEYS } from "./storage-keys";
import type { SyncBackendConfig } from "./types";

export { BROWSER_SYNC_BACKEND_ID, NO_SYNC_BACKEND_ID, WEBDAV_SYNC_BACKEND_ID };

export type RemoteStorageChange<T = unknown> = {
  newValue?: T;
  oldValue?: T;
};

export type SyncBackend = {
  config: SyncBackendConfig;
  read<T>(key: string): Promise<T | undefined>;
  write<T>(key: string, value: T): Promise<T | undefined>;
  remove(key: string): Promise<void>;
  test(): Promise<void>;
  watch?<T>(
    key: string,
    callback: (change: RemoteStorageChange<T>) => void,
  ): () => void;
};

export type WebDavSyncBackendConfig = Extract<
  SyncBackendConfig,
  { type: "webdav" }
>;

export const DEFAULT_SYNC_BACKENDS: SyncBackendConfig[] = [
  {
    id: BROWSER_SYNC_BACKEND_ID,
    type: SYNC_BACKEND_TYPES.browserSync,
    name: syncBackendDefaultName(BROWSER_SYNC_BACKEND_ID),
  },
];

const webDavReadCaches = new Map<string, Map<string, WebDavReadCache>>();

export async function getActiveSyncBackend() {
  const backends = await getStoredSyncBackends();
  const activeId = await getStoredActiveSyncBackendId();
  if (activeId === NO_SYNC_BACKEND_ID)
    throw new Error("Sync backend is disabled.");
  const backendConfig = backends.find((backend) => backend.id === activeId);
  if (!backendConfig) throw new Error(`Unknown sync backend: ${activeId}`);
  return createSyncBackend(backendConfig);
}

export async function isSyncBackendEnabled() {
  return (await getStoredActiveSyncBackendId()) !== NO_SYNC_BACKEND_ID;
}

export async function getStoredSyncBackends() {
  const api = getBrowserApi();
  const result = await api.storage.local.get(STORAGE_KEYS.syncBackends);
  const backends = result[STORAGE_KEYS.syncBackends] as
    | SyncBackendConfig[]
    | undefined;
  return normalizeSyncBackends(backends);
}

export async function getStoredActiveSyncBackendId() {
  const api = getBrowserApi();
  const result = await api.storage.local.get(STORAGE_KEYS.activeSyncBackendId);
  return (
    (result[STORAGE_KEYS.activeSyncBackendId] as string | undefined) ||
    NO_SYNC_BACKEND_ID
  );
}

export function normalizeSyncBackends(value: SyncBackendConfig[] | undefined) {
  const byId = new Map<string, SyncBackendConfig>();
  for (const backend of DEFAULT_SYNC_BACKENDS) byId.set(backend.id, backend);
  for (const backend of value || []) {
    if (!backend?.id || !backend?.type || !backend?.name) continue;
    if (backend.type === SYNC_BACKEND_TYPES.webDav && !backend.url) continue;
    byId.set(backend.id, backend);
  }
  return Array.from(byId.values());
}

export function createSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  if (backendConfig.type === SYNC_BACKEND_TYPES.webDav)
    return createWebDavBackend(backendConfig);
  return createBrowserSyncBackend(backendConfig);
}

export function syncBackendSupportsChatAttachments(
  backendType: SyncBackendConfig["type"],
) {
  return backendType === SYNC_BACKEND_TYPES.webDav;
}

function createBrowserSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  return {
    config: backendConfig,
    async read<T>(key: string) {
      const result = await getBrowserApi().storage.sync.get(key);
      const encoded = result[key] as string | undefined;
      return readAutomergeValue<T>(
        automergeBackendCacheKey(backendConfig, key),
        encoded ? base64ToBytes(encoded) : undefined,
      );
    },
    async write<T>(key: string, value: T) {
      const stored = await getBrowserApi().storage.sync.get(key);
      const encoded = stored[key] as string | undefined;
      const result = await writeAutomergeValue<T>(
        automergeBackendCacheKey(backendConfig, key),
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
      await removeLocalAutomergeDocument(
        automergeBackendCacheKey(backendConfig, key),
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
            automergeBackendCacheKey(backendConfig, key),
            change.newValue,
          ),
          decodeBrowserSyncChangeValue<T>(
            automergeBackendCacheKey(backendConfig, key),
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
    ? readAutomergeValue<T>(key, base64ToBytes(value))
    : undefined;
}

function createWebDavBackend(
  backendConfig: WebDavSyncBackendConfig,
): SyncBackend {
  const readCache = webDavReadCacheFor(backendConfig);
  return {
    config: backendConfig,
    async read<T>(key: string) {
      const bytes = await readWebDavBytes(
        backendConfig,
        key,
        readCache.get(key),
      );
      if (bytes?.notModified) return readCache.get(key)?.value as T | undefined;
      if (!bytes) {
        readCache.delete(key);
        return readAutomergeValue<T>(
          automergeBackendCacheKey(backendConfig, key),
          undefined,
        );
      }
      const value = await readAutomergeValue<T>(
        automergeBackendCacheKey(backendConfig, key),
        bytes.data,
      );
      readCache.set(key, {
        etag: bytes.etag,
        lastModified: bytes.lastModified,
        value,
      });
      return value;
    },
    async write<T>(key: string, value: T) {
      const bytes = await readWebDavBytes(
        backendConfig,
        key,
        readCache.get(key),
      );
      const result = await writeAutomergeValue<T>(
        automergeBackendCacheKey(backendConfig, key),
        value,
        bytes?.notModified ? undefined : bytes?.data,
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
      await removeLocalAutomergeDocument(
        automergeBackendCacheKey(backendConfig, key),
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
  value: unknown;
};

type WebDavReadResult =
  | { notModified: true }
  | { data: Uint8Array; etag?: string; lastModified?: string };

function webDavReadCacheFor(backendConfig: WebDavSyncBackendConfig) {
  const scope = automergeBackendCacheKey(backendConfig, "");
  let cache = webDavReadCaches.get(scope);
  if (!cache) {
    cache = new Map<string, WebDavReadCache>();
    webDavReadCaches.set(scope, cache);
  }
  return cache;
}

function automergeBackendCacheKey(
  backendConfig: SyncBackendConfig,
  key: string,
) {
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
    `${encodeURIComponent(key)}.amrg`,
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

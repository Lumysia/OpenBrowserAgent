import * as config from "./config";
import {
  base64ToBytes,
  bytesToBase64,
  mergeTinyBaseSyncValue,
  readTinyBaseSyncValue,
  removeLocalTinyBaseSyncDocument,
  writeTinyBaseSyncValue,
} from "./sync-tinybase-doc";
import { getBrowserApi } from "./browser-api";
import type { SyncBackendConfig } from "./types";
import {
  registerSyncBackendImpl,
  SYNC_BACKEND_TYPES,
  type SyncBackend,
  type SyncBackendImpl,
  type WebDavSyncBackendConfig,
} from "./sync-backends";

export function createSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  return serializeSyncBackend(
    backendConfig.type === SYNC_BACKEND_TYPES.webDav
      ? createWebDavBackend(backendConfig)
      : createBrowserSyncBackend(backendConfig),
  );
}

function createBrowserSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  return {
    config: backendConfig,
    async read<T>(key: string) {
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
  };
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
  readWebDavObject,
  writeWebDavObject,
  removeWebDavObject,
} satisfies SyncBackendImpl);

// Per-document serialization
const operations = new Map<string, Promise<unknown>>();

export function syncBackendCacheKey(
  backendConfig: SyncBackendConfig,
  key: string,
) {
  const scope =
    backendConfig.type === SYNC_BACKEND_TYPES.webDav
      ? `${backendConfig.type}:${backendConfig.username || ""}:${backendConfig.url}`
      : backendConfig.id;
  return `${scope}:${key}`;
}

// All extension contexts reach these adapters through the background. Serialize
// read/modify/write per document, including across freshly-created adapters.
function serializeSyncBackend(backend: SyncBackend): SyncBackend {
  function run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const scope = syncBackendCacheKey(backend.config, key);
    const previous = operations.get(scope) || Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    operations.set(scope, next);
    const cleanup = () => {
      if (operations.get(scope) === next) operations.delete(scope);
    };
    next.then(cleanup, cleanup);
    return next;
  }
  return {
    ...backend,
    read: <T>(key: string) => run(key, () => backend.read<T>(key)),
    write: <T>(key: string, value: T) =>
      run(key, () => backend.write(key, value)),
    remove: (key) => run(key, () => backend.remove(key)),
  };
}

// WebDAV documents
type RemoteDocument = {
  data: Uint8Array;
  etag?: string;
  lastModified?: string;
  decoded?: { value: unknown };
};
const readCache = new Map<string, RemoteDocument>();
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 32;
const MAX_WRITE_ATTEMPTS = 3;

function createWebDavBackend(config: WebDavSyncBackendConfig): SyncBackend {
  return {
    config,
    async read<T>(key: string) {
      const remote = await readDocument(config, key);
      if (remote?.decoded) return structuredClone(remote.decoded.value) as T;
      const value = await readTinyBaseSyncValue<T>(
        syncBackendCacheKey(config, key),
        remote?.data,
      );
      if (remote) remote.decoded = { value: structuredClone(value) };
      return value;
    },
    async write<T>(key: string, value: T) {
      const scope = syncBackendCacheKey(config, key);
      let remote = await readDocument(config, key);
      if (remote) delete remote.decoded;
      // Stamp the user's changes once. Conflict retries only merge CRDT state.
      let result: { bytes: Uint8Array; value: T | undefined } =
        await writeTinyBaseSyncValue(scope, value, remote?.data);
      for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        const response = await requestWebDav(config, objectUrl(config, key), {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            ...writePrecondition(remote),
          },
          body: bytesToArrayBuffer(result.bytes),
        });
        if (response.status === 412 && attempt + 1 < MAX_WRITE_ATTEMPTS) {
          remote = await readDocument(config, key, true);
          if (remote)
            result = await mergeTinyBaseSyncValue<T>(scope, remote.data);
          continue;
        }
        if (!response.ok) await throwWebDavError(response, "write");
        cacheDocument(scope, {
          data: result.bytes,
          decoded: { value: structuredClone(result.value) },
          ...validators(response),
        });
        return result.value;
      }
      throw new Error("WebDAV write conflict retries exhausted.");
    },
    async remove(key) {
      const remote = await readDocument(config, key);
      if (remote) {
        const response = await requestWebDav(config, objectUrl(config, key), {
          method: "DELETE",
          headers: writePrecondition(remote),
        });
        if (!response.ok && response.status !== 404)
          await throwWebDavError(response, "remove");
      }
      readCache.delete(syncBackendCacheKey(config, key));
      await removeLocalTinyBaseSyncDocument(syncBackendCacheKey(config, key));
    },
    async test() {
      const response = await requestWebDav(config, baseUrl(config), {
        method: "PROPFIND",
        headers: { Depth: "0" },
      });
      if (!response.ok && response.status !== 207)
        await throwWebDavError(response, "test");
    },
  };
}

async function readDocument(
  config: WebDavSyncBackendConfig,
  key: string,
  fresh = false,
): Promise<RemoteDocument | undefined> {
  const scope = syncBackendCacheKey(config, key);
  // Validators are valid only with the exact response body they describe. Old
  // persisted metadata alone cannot satisfy a 304 after a background restart.
  const cached = fresh ? undefined : readCache.get(scope);
  const headers: Record<string, string> = {};
  if (cached?.etag) headers["If-None-Match"] = cached.etag;
  else if (cached?.lastModified)
    headers["If-Modified-Since"] = cached.lastModified;
  const response = await requestWebDav(config, objectUrl(config, key), {
    method: "GET",
    headers,
  });
  if (response.status === 304 && cached) {
    cacheDocument(scope, cached);
    return cached;
  }
  if (response.status === 404) {
    readCache.delete(scope);
    return undefined;
  }
  if (!response.ok) await throwWebDavError(response, "read");
  const remote = {
    data: new Uint8Array(await response.arrayBuffer()),
    ...validators(response),
  };
  cacheDocument(scope, remote);
  return remote;
}

function validators(response: Response) {
  return {
    etag: response.headers.get("ETag") || undefined,
    lastModified: response.headers.get("Last-Modified") || undefined,
  };
}

function writePrecondition(
  remote: RemoteDocument | undefined,
): Record<string, string> {
  if (!remote) return { "If-None-Match": "*" };
  if (remote.etag && !remote.etag.startsWith("W/"))
    return { "If-Match": remote.etag };
  // HTTP dates only have second precision. Prefer a strong ETag whenever the
  // server provides one; date-only servers retain HTTP's weaker guarantee.
  if (remote.lastModified)
    return { "If-Unmodified-Since": remote.lastModified };
  throw new Error(
    "WebDAV server must provide a strong ETag or Last-Modified to safely update an existing sync document.",
  );
}

function cacheDocument(scope: string, remote: RemoteDocument) {
  readCache.delete(scope);
  if (
    (!remote.etag && !remote.lastModified) ||
    remote.data.byteLength > MAX_CACHE_BYTES
  )
    return;
  readCache.set(scope, remote);
  let bytes = Array.from(readCache.values()).reduce(
    (total, item) => total + item.data.byteLength,
    0,
  );
  for (const [key, item] of readCache) {
    if (bytes <= MAX_CACHE_BYTES && readCache.size <= MAX_CACHE_ENTRIES) break;
    readCache.delete(key);
    bytes -= item.data.byteLength;
  }
}

// WebDAV transport and attachment objects
export async function readWebDavObject(
  backendConfig: WebDavSyncBackendConfig,
  name: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const response = await requestWebDav(
    backendConfig,
    rawObjectUrl(backendConfig, name),
    { method: "GET", signal },
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
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  await ensureWebDavCollections(backendConfig, name, signal);
  signal?.throwIfAborted();
  const response = await requestWebDav(
    backendConfig,
    rawObjectUrl(backendConfig, name),
    {
      method: "PUT",
      signal,
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
  signal?: AbortSignal,
) {
  const parts = name.split("/").filter(Boolean);
  if (parts.length <= 1) return;
  let currentPath = "";
  for (const part of parts.slice(0, -1)) {
    signal?.throwIfAborted();
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const response = await requestWebDav(
      backendConfig,
      rawObjectUrl(backendConfig, currentPath),
      { method: "MKCOL", signal },
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

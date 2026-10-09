import type { SyncBackend, WebDavSyncBackendConfig } from "./sync-backends";
import { syncBackendCacheKey } from "./sync-backend-operations";
import {
  mergeTinyBaseSyncValue,
  readTinyBaseSyncValue,
  removeLocalTinyBaseSyncDocument,
  writeTinyBaseSyncValue,
} from "./sync-tinybase-doc";
import {
  baseUrl,
  bytesToArrayBuffer,
  objectUrl,
  requestWebDav,
  throwWebDavError,
} from "./sync-webdav-transport";

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

export function createWebDavBackend(
  config: WebDavSyncBackendConfig,
): SyncBackend {
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

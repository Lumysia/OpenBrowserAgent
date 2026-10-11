import type { WebDavSyncBackendConfig } from "./sync-backends";
import {
  documentScope,
  type DocumentTransport,
  type RemoteDocument,
} from "./sync-documents";

const DOCUMENT_EXTENSION = ".tinybase";

// One entry per synced document. Validators are valid only with the exact
// body they describe, so they live in memory next to it: persisted metadata
// alone cannot satisfy a 304 after a background restart.
const readCache = new Map<string, RemoteDocument>();

export function createWebDavTransport(
  config: WebDavSyncBackendConfig,
): DocumentTransport {
  const scope = (name: string) => documentScope(config, name);
  const cache = (name: string, remote: RemoteDocument) => {
    if (remote.etag || remote.lastModified) readCache.set(scope(name), remote);
    else readCache.delete(scope(name));
    return remote;
  };
  return {
    config,
    peek: (name) => readCache.get(scope(name)),
    async get(name, fresh = false) {
      const cached = fresh ? undefined : readCache.get(scope(name));
      const headers: Record<string, string> = {};
      if (cached?.etag) headers["If-None-Match"] = cached.etag;
      else if (cached?.lastModified)
        headers["If-Modified-Since"] = cached.lastModified;
      const response = await requestWebDav(config, documentUrl(config, name), {
        method: "GET",
        headers,
      });
      if (response.status === 304 && cached) return cached;
      if (response.status === 404) {
        readCache.delete(scope(name));
        return undefined;
      }
      if (!response.ok) await throwWebDavError(response, "read");
      return cache(name, {
        data: new Uint8Array(await response.arrayBuffer()),
        ...validators(response),
      });
    },
    async put(name, bytes, previous) {
      const put = () =>
        requestWebDav(config, documentUrl(config, name), {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            ...writePrecondition(previous),
          },
          body: bytesToArrayBuffer(bytes),
        });
      let response = await put();
      // The first item of a collection needs its folder.
      if (
        (response.status === 409 || response.status === 404) &&
        name.includes("/")
      ) {
        await ensureWebDavCollections(config, name);
        response = await put();
      }
      if (response.status === 412) return "conflict";
      if (!response.ok) await throwWebDavError(response, "write");
      return cache(name, { data: bytes, ...validators(response) });
    },
    async remove(name) {
      // Removal is unconditional: only clearing data and deleted items remove
      // documents, and they want them gone whatever another device wrote. A
      // conditional delete also fails on servers that send only weak ETags.
      readCache.delete(scope(name));
      await deleteWebDav(config, documentUrl(config, name));
    },
    async removeFolder(key) {
      const prefix = scope(`${key}/`);
      for (const cached of readCache.keys())
        if (cached.startsWith(prefix)) readCache.delete(cached);
      await deleteWebDav(config, rawObjectUrl(config, `${key}/`));
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

async function deleteWebDav(config: WebDavSyncBackendConfig, url: string) {
  const response = await requestWebDav(config, url, { method: "DELETE" });
  if (!response.ok && response.status !== 404)
    await throwWebDavError(response, "remove");
}

// Attachment objects
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
  await deleteWebDav(backendConfig, rawObjectUrl(backendConfig, name));
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
      rawObjectUrl(backendConfig, `${currentPath}/`),
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

function documentUrl(backendConfig: WebDavSyncBackendConfig, name: string) {
  return rawObjectUrl(backendConfig, `${name}${DOCUMENT_EXTENSION}`);
}

function rawObjectUrl(backendConfig: WebDavSyncBackendConfig, name: string) {
  const encodedPath = name
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return new URL(
    `${encodedPath}${name.endsWith("/") ? "/" : ""}`,
    baseUrl(backendConfig),
  ).toString();
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

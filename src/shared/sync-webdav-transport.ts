import type { WebDavSyncBackendConfig } from "./sync-backends";

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

export function bytesToArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function objectUrl(backendConfig: WebDavSyncBackendConfig, key: string) {
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

export function baseUrl(backendConfig: WebDavSyncBackendConfig) {
  return backendConfig.url.endsWith("/")
    ? backendConfig.url
    : `${backendConfig.url}/`;
}

export async function requestWebDav(
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

export async function throwWebDavError(
  response: Response,
  action: string,
): Promise<never> {
  const body = await response.text().catch(() => "");
  throw new Error(
    `WebDAV ${action} failed: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 180)}` : ""}`,
  );
}

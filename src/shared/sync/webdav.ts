import type { WebDavSyncBackendConfig } from "../types";
import { gunzip, gzip, sha256Hex, toArrayBuffer } from "./codec";
import { decodeRoot, encodeRoot } from "./root";
import {
  BlobIntegrityError,
  parseRetryAfter,
  SyncHttpError,
  type StoredBlob,
  type Transport,
} from "./transport";

// WebDAV layout under the configured folder:
//   root.json.gz             the only file ever overwritten (If-Match)
//   blobs/<h>/<hash>.gz      immutable content, named by SHA-256
// One hex character of sharding keeps folders small while a full listing
// (the weekly orphan sweep) stays at 17 requests.

const ROOT_NAME = "root.json.gz";
const BLOBS = "blobs";
const PROBE_NAME = ".openbrowseragent-probe";
// RFC 9110 entity-tag without the weak prefix.
const STRONG_ETAG = /^"[\x21\x23-\x7e\x80-\xff]*"$/;

export const strongEtag = (value: string | null) =>
  value && STRONG_ETAG.test(value) ? value : undefined;

const blobPath = (hash: string) => `${BLOBS}/${hash[0]}/${hash}.gz`;

// A request that gets no complete answer in time fails, so a server that
// hangs never holds up sync (or the work queued behind a round). Uploads
// get extra time per byte for slow connections.
const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_BYTES_PER_MS = 25;

export function createWebDavTransport(
  config: Pick<WebDavSyncBackendConfig, "url" | "username" | "password">,
  fetchImpl: typeof fetch = fetch,
  { timeoutMs = REQUEST_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Transport {
  const base = config.url.endsWith("/") ? config.url : `${config.url}/`;
  const url = (path: string) => new URL(path, base).toString();

  async function request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Cache-Control", "no-cache");
    if (config.username || config.password)
      headers.set(
        "Authorization",
        `Basic ${btoa(
          String.fromCharCode(
            ...new TextEncoder().encode(
              `${config.username || ""}:${config.password || ""}`,
            ),
          ),
        )}`,
      );
    const bytes = init.body instanceof ArrayBuffer ? init.body.byteLength : 0;
    return fetchImpl(url(path), {
      ...init,
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(timeoutMs + bytes / UPLOAD_BYTES_PER_MS),
    });
  }

  async function fail(response: Response, action: string): Promise<never> {
    const body = await response.text().catch(() => "");
    throw new SyncHttpError(
      `WebDAV ${action} failed: ${response.status} ${response.statusText}${
        body ? ` - ${body.replace(/\s+/g, " ").slice(0, 160)}` : ""
      }`,
      response.status,
      parseRetryAfter(response.headers.get("Retry-After")),
    );
  }

  // Folders are created on the first 404/409, deepest first: a missing
  // parent (409) is created before trying again. A parallel MKCOL of the
  // same folder can fail (WsgiDAV answers 500), so creations are shared.
  const creating = new Map<string, Promise<void>>();
  function ensureFolder(path: string): Promise<void> {
    let pending = creating.get(path);
    if (!pending) {
      pending = (async () => {
        let response = await request(path, { method: "MKCOL" });
        const parent = path.replace(/[^/]+\/$/, "");
        if (response.status === 409 && parent) {
          await ensureFolder(parent);
          response = await request(path, { method: "MKCOL" });
        }
        if (!response.ok && response.status !== 405)
          await fail(response, "create folder");
      })().finally(() => creating.delete(path));
      creating.set(path, pending);
    }
    return pending;
  }

  async function put(path: string, bytes: Uint8Array, headers: HeadersInit) {
    const send = () =>
      request(path, {
        method: "PUT",
        headers: { "Content-Type": "application/gzip", ...headers },
        body: toArrayBuffer(bytes),
      });
    let response = await send();
    // The folder is missing, or was removed meanwhile (a cloud clear on
    // another device): create it and try again, twice at most.
    for (
      let attempt = 0;
      attempt < 2 &&
      (response.status === 404 || response.status === 409) &&
      path.includes("/");
      attempt++
    ) {
      await ensureFolder(path.slice(0, path.lastIndexOf("/") + 1));
      response = await send();
    }
    return response;
  }

  async function remove(path: string) {
    const response = await request(path, { method: "DELETE" });
    if (!response.ok && response.status !== 404) await fail(response, "delete");
  }

  async function propfind(path: string, depth: "0" | "1") {
    const response = await request(path, {
      method: "PROPFIND",
      headers: { Depth: depth, "Content-Type": "application/xml" },
      body: '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><getlastmodified/><resourcetype/></prop></propfind>',
    });
    if (response.status === 404) return undefined;
    if (!response.ok) await fail(response, "list");
    return parseMultistatus(await response.text(), url(path));
  }

  return {
    kind: "webdav",
    async readRoot(etag) {
      const response = await request(ROOT_NAME, {
        headers: etag ? { "If-None-Match": etag } : {},
      });
      if (response.status === 304 && etag) return { status: "unchanged" };
      if (response.status === 404) return { status: "missing" };
      if (!response.ok) await fail(response, "read");
      const root = await decodeRoot(
        new Uint8Array(await response.arrayBuffer()),
      );
      return {
        status: "ok",
        root,
        etag: strongEtag(response.headers.get("ETag")),
      };
    },
    async writeRoot(root, etag) {
      const response = await put(
        ROOT_NAME,
        await encodeRoot(root),
        etag ? { "If-Match": etag } : { "If-None-Match": "*" },
      );
      if (response.status === 412) return { status: "conflict" };
      if (!response.ok) await fail(response, "write");
      return { status: "ok", etag: strongEtag(response.headers.get("ETag")) };
    },
    async getBlob(hash) {
      const response = await request(blobPath(hash));
      if (response.status === 404) return undefined;
      if (!response.ok) await fail(response, "read");
      const payload = await gunzip(
        new Uint8Array(await response.arrayBuffer()),
      ).catch(() => {
        throw new BlobIntegrityError(`Sync blob ${hash} is not valid gzip.`);
      });
      if ((await sha256Hex(payload)) !== hash)
        throw new BlobIntegrityError(
          `Sync blob ${hash} does not match its hash.`,
        );
      return payload;
    },
    async hasBlob(hash) {
      const response = await request(blobPath(hash), { method: "HEAD" });
      if (response.status === 404) return false;
      if (!response.ok) await fail(response, "read");
      return true;
    },
    async putBlob(hash, payload) {
      const response = await put(blobPath(hash), await gzip(payload), {});
      if (!response.ok) await fail(response, "write");
    },
    deleteBlob: (hash) => remove(blobPath(hash)),
    async listBlobs() {
      const shards = (await propfind(`${BLOBS}/`, "1")) ?? [];
      const blobs: StoredBlob[] = [];
      for (const shard of shards.filter((entry) => entry.folder && entry.path))
        for (const entry of (await propfind(`${BLOBS}/${shard.path}/`, "1")) ??
          []) {
          const hash = /^([0-9a-f]{64})\.gz$/.exec(entry.path)?.[1];
          if (hash && !entry.folder)
            blobs.push({ hash, modifiedAt: entry.modifiedAt ?? 0 });
        }
      return blobs;
    },
    async clear() {
      await remove(ROOT_NAME);
      await remove(`${BLOBS}/`);
    },
    // Connection test plus what writes rely on: strong ETags and a refused
    // stale If-Match. Leaves nothing behind.
    async check() {
      let listing = await request("", {
        method: "PROPFIND",
        headers: { Depth: "0" },
      });
      // A folder that does not exist yet is created (its parent must exist).
      if (listing.status === 404) {
        const created = await request("", { method: "MKCOL" });
        if (!created.ok) await fail(created, "create folder");
        listing = await request("", {
          method: "PROPFIND",
          headers: { Depth: "0" },
        });
      }
      if (!listing.ok) await fail(listing, "connect");
      await listing.arrayBuffer().catch(() => undefined);
      const probe = new TextEncoder().encode(String(Date.now()));
      const created = await request(PROBE_NAME, {
        method: "PUT",
        headers: { "If-None-Match": "*" },
        body: toArrayBuffer(probe),
      });
      if (!created.ok && created.status !== 412) await fail(created, "write");
      try {
        const read = await request(PROBE_NAME);
        if (!read.ok) await fail(read, "read");
        await read.arrayBuffer();
        const stale = await request(PROBE_NAME, {
          method: "PUT",
          headers: { "If-Match": '"openbrowseragent-stale"' },
          body: toArrayBuffer(probe),
        });
        await stale.arrayBuffer().catch(() => undefined);
        return {
          strongEtags: !!strongEtag(read.headers.get("ETag")),
          honoursPreconditions: stale.status === 412,
        };
      } finally {
        await remove(PROBE_NAME);
      }
    },
  };
}

type ListedEntry = { path: string; folder: boolean; modifiedAt?: number };

// Children of a PROPFIND Depth 1 answer, by name relative to `parent`.
export function parseMultistatus(xml: string, parent: string): ListedEntry[] {
  const entries: ListedEntry[] = [];
  const parentPath = new URL(parent).pathname.replace(/\/?$/, "/");
  for (const [block] of xml.matchAll(
    /<(?:[\w-]+:)?response\b[\s\S]*?<\/(?:[\w-]+:)?response>/g,
  )) {
    const href = /<(?:[\w-]+:)?href>([^<]*)</.exec(block)?.[1]?.trim();
    if (!href) continue;
    const path = decodeURIComponent(new URL(href, parent).pathname);
    if (!path.startsWith(decodeURIComponent(parentPath))) continue;
    const name = path
      .slice(decodeURIComponent(parentPath).length)
      .replace(/\/$/, "");
    if (!name || name.includes("/")) continue;
    const modified = /<(?:[\w-]+:)?getlastmodified>([^<]*)</.exec(block)?.[1];
    entries.push({
      path: name,
      folder: /<(?:[\w-]+:)?collection\s*\/>/.test(block),
      modifiedAt: modified ? Date.parse(modified) : undefined,
    });
  }
  return entries;
}

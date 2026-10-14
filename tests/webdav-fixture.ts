// A WebDAV server in memory, reached through `fetch`: files with strong
// ETags, If-Match / If-None-Match on PUT, MKCOL, DELETE. Enough for the
// WebDAV transport, so tests can damage files the way real servers did.

export type DavFile = { body: Uint8Array; etag: string };

export function memoryDav(base = "https://dav.test/sync/") {
  const files = new Map<string, DavFile>();
  // Paths whose next PUTs answer 423, as while another client uploads them.
  const locked = new Map<string, number>();
  let version = 0;
  const pathOf = (input: RequestInfo | URL) =>
    new URL(String(input instanceof Request ? input.url : input)).pathname;
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = pathOf(input);
    const headers = new Headers(init.headers);
    const method = init.method ?? "GET";
    const file = files.get(path);
    if (method === "GET" || method === "HEAD") {
      if (!file) return new Response(null, { status: 404 });
      if (headers.get("If-None-Match") === file.etag)
        return new Response(null, { status: 304 });
      return new Response(method === "HEAD" ? null : file.body.slice(), {
        status: 200,
        headers: { ETag: file.etag },
      });
    }
    if (method === "PUT") {
      const lockedFor = locked.get(path) ?? 0;
      if (lockedFor > 0) {
        locked.set(path, lockedFor - 1);
        return new Response(null, { status: 423 });
      }
      const ifMatch = headers.get("If-Match");
      if (ifMatch && ifMatch !== file?.etag)
        return new Response(null, { status: 412 });
      if (headers.get("If-None-Match") === "*" && file)
        return new Response(null, { status: 412 });
      const body = new Uint8Array(await new Response(init.body).arrayBuffer());
      const etag = `"v${++version}"`;
      files.set(path, { body, etag });
      return new Response(null, { status: 201, headers: { ETag: etag } });
    }
    if (method === "DELETE") {
      for (const key of [...files.keys()])
        if (
          key === path ||
          key.startsWith(path.endsWith("/") ? path : `${path}/`)
        )
          files.delete(key);
      return new Response(null, { status: 204 });
    }
    if (method === "MKCOL") return new Response(null, { status: 201 });
    return new Response(null, { status: 405 });
  }) as typeof globalThis.fetch;
  const at = (name: string) => `${new URL(base).pathname}${name}`;
  return {
    base,
    fetch,
    files,
    get: (name: string) => files.get(at(name))?.body,
    // Replaces a file's bytes the way an interrupted upload leaves it.
    set(name: string, body: Uint8Array) {
      files.set(at(name), { body, etag: `"v${++version}"` });
    },
    // The next `puts` uploads of a file answer 423 Locked.
    lock(name: string, puts: number) {
      locked.set(at(name), puts);
    },
  };
}

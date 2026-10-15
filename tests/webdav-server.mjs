import { createServer } from "node:http";
import { memoryDav } from "./webdav-fixture.ts";

// The in-memory WebDAV server (webdav-fixture.ts) over HTTP, for browser
// tests, with the PROPFIND listings the extension's connection test and blob
// sweep ask for. Every folder exists.
export async function webDavServer() {
  const server = createServer(async (request, response) => {
    const url = `http://${request.headers.host}${request.url}`;
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (request.method === "PROPFIND") return propfind(request, response);
    const answer = await dav.fetch(url, {
      method: request.method,
      headers: request.headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    response.writeHead(answer.status, Object.fromEntries(answer.headers));
    response.end(Buffer.from(await answer.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/sync/`;
  const dav = memoryDav(base);

  function propfind(request, response) {
    const path = new URL(request.url, base).pathname.replace(/\/?$/, "/");
    const children =
      request.headers.depth === "1"
        ? [...dav.files.keys()]
            .filter((file) => file.startsWith(path))
            .map((file) => {
              const rest = file.slice(path.length);
              const slash = rest.indexOf("/");
              return slash < 0 ? rest : rest.slice(0, slash + 1);
            })
        : [];
    const entry = (href) =>
      `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${
        href.endsWith("/")
          ? "<d:resourcetype><d:collection/></d:resourcetype>"
          : "<d:resourcetype/>"
      }</d:prop></d:propstat></d:response>`;
    response.writeHead(207, { "Content-Type": "application/xml" });
    response.end(
      `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${[
        path,
        ...new Set(children.map((child) => path + child)),
      ]
        .map(entry)
        .join("")}</d:multistatus>`,
    );
  }

  return {
    url: base,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

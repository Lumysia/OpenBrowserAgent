import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { createSyncBackend } from "../src/shared/sync-backends-impl";
import type { Chat, ChatMessage, Skill } from "../src/shared/types";
import { browserStorage, installBrowser } from "./helpers";

afterEach(() => mock.restoreAll());

const URL_BASE = "https://dav.example/sync/";

// In-memory WebDAV server: strong ETags, conditional GET/PUT, folders.
function webDavServer() {
  const files = new Map<string, { body: Uint8Array; etag: string }>();
  const folders = new Set<string>([""]);
  const log: string[] = [];
  let version = 0;
  const now = Date.now;
  mock.method(Date, "now", () => now() + clockOffset);
  mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    const path = decodeURIComponent(new URL(url).pathname).slice(
      new URL(URL_BASE).pathname.length,
    );
    const method = init?.method || "GET";
    const headers = new Headers(init?.headers);
    const file = files.get(path);
    log.push(`${method} ${path}`);
    if (method === "GET") {
      if (!file) return new Response(null, { status: 404 });
      if (headers.get("If-None-Match") === file.etag)
        return new Response(null, { status: 304 });
      return new Response(file.body, { headers: { ETag: file.etag } });
    }
    if (method === "PUT") {
      const parent = path.includes("/") ? path.replace(/\/[^/]*$/, "/") : "";
      if (!folders.has(parent)) return new Response(null, { status: 409 });
      const match = headers.get("If-Match");
      if (headers.get("If-None-Match") === "*" ? file : match !== file?.etag)
        return new Response(null, { status: 412 });
      const etag = `"${++version}"`;
      files.set(path, {
        body: new Uint8Array(init!.body as ArrayBuffer),
        etag,
      });
      return new Response(null, { status: 201, headers: { ETag: etag } });
    }
    if (method === "MKCOL") {
      folders.add(path);
      return new Response(null, { status: 201 });
    }
    if (method === "DELETE") {
      for (const name of files.keys())
        if (name === path || (path.endsWith("/") && name.startsWith(path)))
          files.delete(name);
      folders.delete(path);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 405 });
  });
  return {
    files,
    log,
    take() {
      return log.splice(0);
    },
  };
}

// Each device has its own local storage and its own WebDAV identity, so the
// in-memory document caches of the shared module stay separate.
let devices = 0;
let clockOffset = 0;
function device(offset = 0) {
  const storage = browserStorage();
  const backend = createSyncBackend({
    id: "webdav",
    type: "webdav",
    name: "WebDAV",
    url: URL_BASE,
    username: `device-${++devices}`,
  });
  const use = () => {
    clockOffset = offset;
    installBrowser(storage);
  };
  return {
    storage,
    async read<T>(key: string) {
      use();
      return backend.read<T>(key);
    },
    async write<T>(key: string, value: T) {
      use();
      return backend.write(key, value);
    },
    async remove(key: string) {
      use();
      return backend.remove(key);
    },
  };
}

const message = (id: string, content: string): ChatMessage => ({
  id,
  role: "user",
  content,
  createdAt: 1,
});
const chat = (id: string, ...messages: ChatMessage[]): Chat => ({
  id,
  title: id,
  createdAt: 1,
  updatedAt: 1,
  messages,
});

test("chats are an index plus one document per chat; only changed chats travel", async () => {
  const server = webDavServer();
  const a = device();
  const b = device();
  const chats = [
    chat("one", message("m1", "hello")),
    chat("two", message("m2", "world")),
  ];
  assert.deepEqual(await a.write("chats", chats), chats);
  assert.deepEqual([...server.files.keys()].sort(), [
    "chats.tinybase",
    "chats/one.tinybase",
    "chats/two.tinybase",
  ]);
  const index = new TextDecoder().decode(
    server.files.get("chats.tinybase")!.body,
  );
  assert.ok(!index.includes("hello"), "the index holds no content");

  assert.deepEqual(await b.read("chats"), chats);
  server.take();
  // A refresh without changes is one conditional request.
  assert.deepEqual(await b.read("chats"), chats);
  assert.deepEqual(server.take(), ["GET chats.tinybase"]);

  const edited = [chat("one", message("m1", "hello!")), chats[1]];
  assert.deepEqual(await a.write("chats", edited), edited);
  assert.deepEqual(
    server.take().filter((request) => request.startsWith("PUT")),
    ["PUT chats/one.tinybase", "PUT chats.tinybase"],
  );
  assert.deepEqual(await b.read("chats"), edited);
  assert.deepEqual(server.take(), [
    "GET chats.tinybase",
    "GET chats/one.tinybase",
  ]);
});

test("concurrent edits to different chats and messages merge", async () => {
  webDavServer();
  // A fast clock wins the index race; the index must still name the content
  // that includes both edits.
  const a = device(60_000);
  const b = device();
  const base = [chat("one", message("m1", "a"), message("m2", "b"))];
  await a.write("chats", base);
  await b.read("chats");
  // Neither device has seen the other's edit.
  await a.write("chats", [
    chat("one", message("m1", "a edited"), message("m2", "b")),
  ]);
  await b.write("chats", [
    chat("one", message("m1", "a"), message("m2", "b edited")),
    chat("new", message("m3", "c")),
  ]);
  const expected = [
    chat("one", message("m1", "a edited"), message("m2", "b edited")),
    chat("new", message("m3", "c")),
  ];
  assert.deepEqual(await b.read("chats"), expected);
  assert.deepEqual(await a.read("chats"), expected);
});

test("a deleted chat stays deleted and its document leaves the cloud", async () => {
  const server = webDavServer();
  const a = device();
  const b = device();
  await a.write("chats", [chat("keep"), chat("drop", message("m", "x"))]);
  await b.read("chats");
  await a.write("chats", [chat("keep")]);
  assert.equal(server.files.has("chats/drop.tinybase"), false);
  assert.deepEqual(await b.read("chats"), [chat("keep")]);
  // An unchanged copy written by the other device does not bring it back.
  assert.deepEqual(await b.write("chats", [chat("keep")]), [chat("keep")]);
  assert.deepEqual(await a.read("chats"), [chat("keep")]);
  assert.ok(
    !Object.keys(b.storage.data).some((key) => key.includes("chats/drop")),
    "the local replica is gone too",
  );

  await a.remove("chats");
  assert.deepEqual([...server.files.keys()], []);
  assert.equal(await b.read("chats"), undefined);
});

test("skill files are split and merge per file", async () => {
  const server = webDavServer();
  const a = device();
  const b = device();
  const skill = (files: Skill["files"]): Skill => ({
    id: "skill",
    name: "Skill",
    description: "",
    files,
  });
  const file = (path: string, content: string) => ({
    path,
    content,
    kind: "markdown" as const,
  });
  await a.write("skills", [
    skill([file("SKILL.md", "v1"), file("notes.md", "n1")]),
  ]);
  assert.ok(server.files.has("skills/skill.tinybase"));
  await b.read("skills");
  await a.write("skills", [
    skill([file("SKILL.md", "v2"), file("notes.md", "n1")]),
  ]);
  await b.write("skills", [
    skill([file("SKILL.md", "v1"), file("notes.md", "n2")]),
  ]);
  const expected = [skill([file("SKILL.md", "v2"), file("notes.md", "n2")])];
  assert.deepEqual(await a.read("skills"), expected);
  assert.deepEqual(await b.read("skills"), expected);
});

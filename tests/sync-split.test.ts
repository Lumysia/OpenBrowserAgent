import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, mock, test } from "node:test";
import { createSyncBackend } from "../src/shared/sync-backends-impl";
import { chatContent, chatSummary } from "../src/shared/chats";
import type {
  Chat,
  ChatContent,
  ChatMessage,
  ChatSummary,
  Skill,
} from "../src/shared/types";
import { browserStorage } from "./helpers";

afterEach(() => mock.restoreAll());

const URL_BASE = "https://dav.example/sync/";

// Each device runs with its own storage and clock, also when its operations
// overlap with another device's.
type Device = { storage: ReturnType<typeof browserStorage>; offset: number };
const current = new AsyncLocalStorage<Device>();
const fallback: Device = { storage: browserStorage(), offset: 0 };
const context = () => current.getStore() ?? fallback;

// In-memory WebDAV server: strong ETags, conditional GET/PUT, folders. `pause`
// holds the next matching request until released.
function webDavServer() {
  const files = new Map<string, { body: Uint8Array; etag: string }>();
  const folders = new Set<string>([""]);
  const log: string[] = [];
  let version = 0;
  let paused:
    | { request: string; reached: () => void; release: Promise<void> }
    | undefined;
  const now = Date.now;
  mock.method(Date, "now", () => now() + context().offset);
  Object.assign(globalThis, {
    chrome: {
      storage: {
        local: {
          get: (key: string | null) => context().storage.area.get(key),
          set: (value: Record<string, unknown>) =>
            context().storage.area.set(value),
          remove: (keys: string | string[]) =>
            context().storage.area.remove(keys),
        },
      },
    },
  });
  mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    const path = decodeURIComponent(new URL(url).pathname).slice(
      new URL(URL_BASE).pathname.length,
    );
    const method = init?.method || "GET";
    const headers = new Headers(init?.headers);
    if (paused?.request === `${method} ${path}`) {
      const { reached, release } = paused;
      paused = undefined;
      reached();
      await release;
    }
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
    // Resolves once `request` arrives; it then waits for `release()`.
    pause(request: string) {
      let release!: () => void;
      const reached = new Promise<void>((resolve) => {
        paused = {
          request,
          reached: resolve,
          release: new Promise((done) => (release = done)),
        };
      });
      return { reached, release: () => release() };
    },
  };
}

// Each device also has its own WebDAV identity, so the in-memory document
// caches of the shared module stay separate.
let devices = 0;
function device(offset = 0) {
  const state: Device = { storage: browserStorage(), offset };
  const backend = createSyncBackend({
    id: "webdav",
    type: "webdav",
    name: "WebDAV",
    url: URL_BASE,
    username: `device-${++devices}`,
  });
  const run = <T>(operation: () => Promise<T>) => current.run(state, operation);
  return {
    storage: state.storage,
    read: <T>(key: string) => run(() => backend.read<T>(key)),
    write: <T>(key: string, value: T) => run(() => backend.write(key, value)),
    // Chats: the list plus the given chats' contents.
    writeChats: (chats: Chat[], contents: string[] = []) =>
      run(() =>
        backend.writeItems(
          "chats",
          chats.map(summary),
          Object.fromEntries(
            chats
              .filter((chat) => contents.includes(chat.id))
              .map((chat) => [chat.id, chatContent(chat)]),
          ),
        ),
      ),
    // A chat's content as opening it on this device would get it.
    openChat: (id: string, have = false) =>
      run(() => backend.readItem("chats", id, have)),
    remove: (key: string) => run(() => backend.remove(key)),
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
const summary = (value: Chat) => chatSummary(value);
const texts = (read: { value?: unknown }) =>
  (read.value as ChatContent | undefined)?.messages.map((m) => m.content);

test("chat content is downloaded only when a chat is opened", async () => {
  const server = webDavServer();
  const a = device();
  const b = device();
  const chats = [
    chat("one", message("m1", "hello")),
    chat("two", message("m2", "world")),
  ];
  await a.writeChats(chats, ["one", "two"]);
  assert.deepEqual([...server.files.keys()].sort(), [
    "chats.tinybase",
    "chats/one.tinybase",
    "chats/two.tinybase",
  ]);
  const index = new TextDecoder().decode(
    server.files.get("chats.tinybase")!.body,
  );
  assert.ok(!index.includes("hello"), "the index holds no content");

  // The list arrives without content.
  server.take();
  assert.deepEqual(await b.read("chats"), chats.map(summary));
  assert.deepEqual(server.take(), ["GET chats.tinybase"]);
  assert.deepEqual(await b.read("chats"), chats.map(summary));
  assert.deepEqual(server.take(), ["GET chats.tinybase"], "304, one request");

  // Opening a chat downloads that chat once.
  assert.deepEqual(texts(await b.openChat("one")), ["hello"]);
  assert.deepEqual(server.take(), ["GET chats/one.tinybase"]);
  assert.deepEqual(await b.openChat("one", true), { unchanged: true });
  assert.deepEqual(server.take(), []);

  // An edit uploads only that chat; the other device downloads it on opening.
  const edited = [chat("one", message("m1", "hello!")), chats[1]];
  await a.writeChats(edited, ["one"]);
  assert.deepEqual(
    server.take().filter((request) => request.startsWith("PUT")),
    ["PUT chats/one.tinybase", "PUT chats.tinybase"],
  );
  await b.read("chats");
  assert.deepEqual(texts(await b.openChat("one", true)), ["hello!"]);
  assert.ok(
    !server.log.includes("GET chats/two.tinybase"),
    "a chat never opened is never downloaded",
  );
});

test("overlapping edits to different chats and messages merge", async () => {
  const server = webDavServer();
  // A has the faster clock, so its index write wins whatever it carries.
  const a = device(60_000);
  const b = device();
  await a.writeChats(
    [chat("one", message("m1", "a"), message("m2", "b"))],
    ["one"],
  );
  await b.read("chats");
  await b.openChat("one");
  // A stores its content, then B stores and indexes its edit before A's
  // index write lands.
  const indexWrite = server.pause("PUT chats.tinybase");
  const aWrite = a.writeChats(
    [chat("one", message("m1", "a edited"), message("m2", "b"))],
    ["one"],
  );
  await indexWrite.reached;
  await b.writeChats(
    [
      chat("one", message("m1", "a"), message("m2", "b edited")),
      chat("new", message("m3", "c")),
    ],
    ["one", "new"],
  );
  indexWrite.release();
  await aWrite;
  assert.deepEqual(
    (await a.read<ChatSummary[]>("chats"))?.map((item) => item.id),
    ["one", "new"],
  );
  await b.read("chats");
  for (const opened of [a, b])
    assert.deepEqual(texts(await opened.openChat("one", true)), [
      "a edited",
      "b edited",
    ]);
});

test("content survives a clear that overlaps another device's write", async () => {
  const server = webDavServer();
  const a = device();
  const b = device();
  const chats = [chat("one", message("m1", "hello")), chat("two")];
  // A list written without its content reports that content as missing.
  assert.deepEqual((await a.writeChats(chats)).missing, ["one", "two"]);
  await a.writeChats(chats, ["one", "two"]);
  await b.read("chats");
  await b.openChat("one");
  // B stores its edit of one; A clears the cloud before B's index write.
  const indexWrite = server.pause("PUT chats.tinybase");
  const edited = chat("one", message("m1", "hello"), message("m2", "more"));
  const write = b.writeChats([edited, chats[1]], ["one"]);
  await indexWrite.reached;
  await a.remove("chats");
  indexWrite.release();
  // Content B was given is stored again; the rest is reported for the
  // caller to send.
  assert.deepEqual((await write).missing, ["two"]);
  const fresh = device();
  await fresh.read("chats");
  assert.deepEqual(texts(await fresh.openChat("one")), ["hello", "more"]);
});

test("a deleted chat stays deleted and its document leaves the cloud", async () => {
  const server = webDavServer();
  const a = device();
  const b = device();
  await a.writeChats(
    [chat("keep"), chat("drop", message("m", "x")), chat("unopened")],
    ["keep", "drop", "unopened"],
  );
  await b.read("chats");
  await b.openChat("drop");
  await a.writeChats([chat("keep"), chat("unopened")]);
  assert.equal(server.files.has("chats/drop.tinybase"), false);
  assert.deepEqual(await b.read("chats"), [
    summary(chat("keep")),
    summary(chat("unopened")),
  ]);
  assert.ok(
    !Object.keys(b.storage.data).some((key) => key.includes("chats/drop")),
    "the local replica is gone too",
  );
  // A device that never opened a chat removes its document as well.
  await b.writeChats([chat("keep")]);
  assert.equal(server.files.has("chats/unopened.tinybase"), false);
  // A list written by the other device without them does not bring them back.
  await a.writeChats([chat("keep")]);
  assert.deepEqual(await b.read("chats"), [summary(chat("keep"))]);

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

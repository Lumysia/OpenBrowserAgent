import assert from "node:assert/strict";
import test from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { SYNC_WARNINGS } from "../src/shared/sync/state";
import { decodeRoot } from "../src/shared/sync/root";
import {
  ALL_ON,
  chat,
  device,
  memoryServer,
  memoryTransport,
  type Device,
} from "./sync-fixtures";

const CHATS = STORAGE_KEYS.chats;

function setup(hooks: Parameters<typeof memoryTransport>[1] = {}) {
  const clock = { now: 1_000_000 };
  const server = memoryServer();
  const transport = memoryTransport(server, hooks);
  const a = device("deviceA", transport, clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, server, a, b, transport };
}

async function addChat(
  on: Device,
  id: string,
  messages: Array<[string, number]>,
) {
  const { summary, content } = chat(id, messages);
  const list = (on.get<unknown[]>(CHATS) ?? []).filter(
    (item) => (item as { id: string }).id !== id,
  );
  await on.set(CHATS, [...list, summary]);
  await on.set(`${CHATS}/${id}`, content);
}

const ids = (on: Device) =>
  (on.get<Array<{ id: string }>>(CHATS) ?? []).map((item) => item.id).sort();

test("settings and lists sync both ways; an idle check is one request", async () => {
  const { clock, server, a, b } = setup();
  await a.set(STORAGE_KEYS.preferences, {
    colorScheme: "dark",
    autoScroll: true,
  });
  await a.set(STORAGE_KEYS.agents, [{ id: "x", name: "X", createdAt: 1 }]);
  await a.sync("edit");
  await b.sync();
  assert.deepEqual(b.get(STORAGE_KEYS.preferences), {
    colorScheme: "dark",
    autoScroll: true,
  });
  assert.deepEqual(b.get(STORAGE_KEYS.agents), [
    { id: "x", name: "X", createdAt: 1 },
  ]);
  clock.now += 1000;
  await b.set(STORAGE_KEYS.preferences, {
    colorScheme: "light",
    autoScroll: true,
  });
  await b.sync("edit");
  await a.sync();
  assert.equal(
    a.get<{ colorScheme: string }>(STORAGE_KEYS.preferences).colorScheme,
    "light",
  );
  server.requests.length = 0;
  await a.sync();
  assert.deepEqual(server.requests, ["GET root"]);
  // An edit that changed nothing makes no request.
  await a.set(STORAGE_KEYS.preferences, {
    colorScheme: "light",
    autoScroll: true,
  });
  await a.sync("edit");
  assert.deepEqual(server.requests, ["GET root"]);
});

test("a device joining an account keeps its own chats and takes settings it never changed", async () => {
  const { clock, a, b } = setup();
  await a.set(STORAGE_KEYS.language, "de-DE");
  await addChat(a, "c1", [["m1", 1]]);
  await a.sync("edit");
  clock.now += 1000;
  // Stored before changes were recorded: older than the account's.
  b.seed(STORAGE_KEYS.language, "en-US");
  await addChat(b, "c2", [["n1", 2]]);
  await b.sync("startup");
  await a.sync();
  assert.equal(b.get(STORAGE_KEYS.language), "de-DE");
  assert.deepEqual(ids(a), ["c1", "c2"]);
  assert.deepEqual(ids(b), ["c1", "c2"]);
});

test("chats load lazily: a chat never opened is never downloaded", async () => {
  const { a, b, server } = setup();
  await addChat(a, "c1", [["m1", 1]]);
  await a.sync("edit");
  server.requests.length = 0;
  await b.sync();
  assert.deepEqual(ids(b), ["c1"]);
  assert.equal(b.get(`${CHATS}/c1`), undefined);
  assert.deepEqual(server.requests, ["GET root"]);
});

test("overlapping saves of the same chat keep both devices' messages, in one order", async () => {
  const { clock, a, b } = setup();
  await addChat(a, "c1", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  // b opens the chat (downloads it), then both add messages at once.
  await b.env.local.set({ [`${CHATS}/c1`]: chat("c1", [["m1", 1]]).content });
  await b.sync();
  clock.now += 1000;
  await addChat(a, "c1", [
    ["m1", 1],
    ["a2", 2],
  ]);
  await addChat(b, "c1", [
    ["m1", 1],
    ["b3", 3],
  ]);
  await a.sync("edit");
  await b.sync("edit");
  await a.sync();
  const order = (on: Device) =>
    on
      .get<{ messages: Array<{ id: string }> }>(`${CHATS}/c1`)
      .messages.map((m) => m.id);
  assert.deepEqual(order(a), ["m1", "a2", "b3"]);
  assert.deepEqual(order(b), ["m1", "a2", "b3"]);
  assert.equal(
    a.get<Array<{ messageCount: number }>>(CHATS)[0].messageCount,
    3,
  );
});

test("a write that races another device's write merges and retries (If-Match)", async () => {
  const clock = { now: 5_000 };
  const server = memoryServer();
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  const a = device(
    "deviceA",
    memoryTransport(server, {
      async beforeWrite() {
        // b writes between a's read and a's write.
        await b.set(STORAGE_KEYS.mcpServers, [
          { id: "m", name: "M", createdAt: 1 },
        ]);
        await b.sync("edit");
      },
    }),
    clock,
    ALL_ON,
  );
  await a.set(STORAGE_KEYS.agents, [{ id: "x", name: "X", createdAt: 1 }]);
  await a.sync("edit");
  const root = await decodeRoot(server.root!);
  assert.ok(root.records["agents/x"]);
  assert.ok(root.records["mcp-servers/m"]);
  assert.equal(server.requests.filter((r) => r === "PUT root").length, 3);
  await b.sync();
  assert.deepEqual(b.get(STORAGE_KEYS.agents), [
    { id: "x", name: "X", createdAt: 1 },
  ]);
});

test("delete versus edit: the newer change wins on both devices", async () => {
  const { clock, a, b } = setup();
  await addChat(a, "c1", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await a.set(CHATS, []);
  clock.now += 1000;
  await b.set(CHATS, [
    { ...chat("c1", [["m1", 1]]).summary, title: "renamed" },
  ]);
  await a.sync("edit");
  await b.sync("edit");
  await a.sync();
  assert.deepEqual(ids(a), ["c1"]);
  assert.equal(a.get<Array<{ title: string }>>(CHATS)[0].title, "renamed");
  // Deleting later wins again.
  clock.now += 1000;
  await a.set(CHATS, []);
  await a.sync("edit");
  await b.sync();
  assert.deepEqual(ids(b), []);
});

test("deleting a chat never opened on that device removes it everywhere", async () => {
  const { a, b } = setup();
  await addChat(a, "c1", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  await b.set(CHATS, []);
  await b.sync("edit");
  await a.sync();
  assert.deepEqual(ids(a), []);
  assert.equal(a.get(`${CHATS}/c1`), undefined);
});

test("a device restored from an old backup does not win with stale data", async () => {
  const { clock, a, b } = setup();
  await a.set(STORAGE_KEYS.preferences, { colorScheme: "dark" });
  await addChat(a, "c1", [["m1", 1]]);
  await a.sync("edit");
  const backup = structuredClone(a.env.local.data);
  clock.now += 10_000;
  await b.sync();
  await b.set(STORAGE_KEYS.preferences, { colorScheme: "light" });
  await addChat(b, "c2", [["n1", 2]]);
  await b.set(
    CHATS,
    b
      .get<unknown[]>(CHATS)
      .filter((item) => (item as { id: string }).id !== "c1"),
  );
  await b.sync("edit");
  // a is restored to the backup and syncs.
  for (const key of Object.keys(a.env.local.data)) delete a.env.local.data[key];
  Object.assign(a.env.local.data, backup);
  await a.sync("startup");
  await b.sync();
  for (const on of [a, b]) {
    assert.equal(
      on.get<{ colorScheme: string }>(STORAGE_KEYS.preferences).colorScheme,
      "light",
    );
    assert.deepEqual(ids(on), ["c2"]);
  }
});

test("a missing blob is never read as a deletion", async () => {
  const { a, b, server } = setup();
  await a.set(STORAGE_KEYS.skills, [
    { id: "s", name: "S", files: [{ path: "SKILL.md", content: "x" }] },
  ]);
  await a.sync("edit");
  server.blobs.clear();
  const result = await b.sync();
  assert.deepEqual(result.warnings, [SYNC_WARNINGS.missingContent]);
  // The skill arrives with the settings; its files wait for their content.
  assert.deepEqual(b.get(STORAGE_KEYS.skills), [{ id: "s", name: "S" }]);
  // Nothing on b counts as a change to upload.
  await b.set(STORAGE_KEYS.skills, b.get(STORAGE_KEYS.skills));
  assert.equal((await b.sync("edit")).pending, 0);
  // a still has it, and the record stays.
  const root = await decodeRoot(server.root!);
  const files = root.records["skill-files/s"];
  assert.ok(files && !files.deleted);
});

test("cleared cloud data is uploaded again by devices that have it", async () => {
  const { a, b, server } = setup();
  await addChat(a, "c1", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  server.root = undefined;
  server.etag = undefined;
  server.blobs.clear();
  await b.sync();
  assert.deepEqual(ids(b), ["c1"]);
  // b never had c1's content, so it leaves c1 to a device that has it.
  assert.equal(
    server.root && (await decodeRoot(server.root)).records["chats/c1"],
    undefined,
  );
  await a.sync();
  assert.deepEqual(ids(a), ["c1"]);
  assert.ok(a.get(`${CHATS}/c1`));
  const blob = (await decodeRoot(server.root!)).records["chats/c1"]?.blob;
  assert.ok(blob && server.blobs.has(blob));
  await b.sync();
  assert.deepEqual(ids(b), ["c1"]);
});

test("mass deletions from another device wait for the user", async () => {
  const { a, b } = setup();
  for (let index = 0; index < 8; index++)
    await addChat(a, `c${index}`, [["m", 1]]);
  await a.sync("edit");
  await b.sync();
  assert.equal(ids(b).length, 8);
  await a.set(CHATS, a.get<unknown[]>(CHATS).slice(0, 2));
  // The deleting device asks too.
  assert.deepEqual((await a.sync("edit")).massDelete, [
    { collection: "chats", count: 6, total: 8, local: true },
  ]);
  await a.confirmDeletes(["chats"]);
  const result = await b.sync();
  assert.deepEqual(result.massDelete, [
    { collection: "chats", count: 6, total: 8 },
  ]);
  assert.equal(ids(b).length, 8);
  await b.sync("manual", {
    massDelete: { collections: ["chats"], keep: false },
  });
  assert.equal(ids(b).length, 2);
});

test("a server whose ETags never match stops writing and says so", async () => {
  const clock = { now: 1 };
  const server = memoryServer();
  const transport = memoryTransport(server);
  const a = device("deviceA", transport, clock, ALL_ON);
  await a.set(STORAGE_KEYS.language, "de-DE");
  await a.sync("edit");
  // The server now rejects every If-Match (an Apache "-gzip" ETag).
  const write = transport.writeRoot;
  transport.writeRoot = async () => ({ status: "conflict" });
  await a.set(STORAGE_KEYS.language, "fr-FR");
  const result = await a.sync("edit");
  assert.deepEqual(result.warnings, [SYNC_WARNINGS.unreliableEtags]);
  assert.equal(result.pending, 1);
  transport.writeRoot = write;
  assert.equal((await a.sync()).pending, 0);
});

test("attachments sync as an index plus lazily downloaded bytes", async () => {
  const { a, b } = setup();
  await a.env.attachments.put({
    id: "f1",
    metadata: { name: "f.txt" },
    content: new Uint8Array([1, 2, 3]),
  });
  await a.set(STORAGE_KEYS.chatAttachments, { f1: { name: "f.txt" } });
  await a.sync("edit");
  await b.sync();
  assert.deepEqual(b.get(STORAGE_KEYS.chatAttachments), {
    f1: { name: "f.txt" },
  });
  assert.equal(b.env.attachments.data.size, 0);
});

test("replaced blobs are collected a day later, orphans on the weekly sweep", async () => {
  const { clock, a, server } = setup();
  await a.set(STORAGE_KEYS.skills, [
    { id: "s", name: "S", files: [{ path: "a", content: "1" }] },
  ]);
  await a.sync("edit");
  const first = [...server.blobs.keys()];
  clock.now += 1000;
  await a.set(STORAGE_KEYS.skills, [
    { id: "s", name: "S", files: [{ path: "a", content: "2" }] },
  ]);
  await a.sync("edit");
  assert.equal(server.blobs.size, 2);
  const root = await decodeRoot(server.root!);
  assert.deepEqual(
    root.garbage.map((entry) => entry.blob),
    first,
  );
  clock.now += 25 * 60 * 60_000;
  await a.set(STORAGE_KEYS.skills, [
    { id: "s", name: "S2", files: [{ path: "a", content: "2" }] },
  ]);
  await a.sync("edit");
  assert.equal(server.blobs.has(first[0]), false);
  assert.deepEqual((await decodeRoot(server.root!)).garbage, []);
});

test("a blob upload that failed is sent with the next round, before the root", async () => {
  const { a, b, transport, server } = setup();
  const put = transport.putBlob;
  transport.putBlob = async () => {
    throw new TypeError("fetch failed");
  };
  await addChat(a, "c1", [["m1", 1]]);
  await assert.rejects(a.sync("edit"));
  transport.putBlob = put;
  await a.sync("poll");
  const root = await decodeRoot(server.root!);
  assert.ok(server.blobs.has(root.records["chats/c1"].blob!));
  await b.sync();
  await b.env.local.set({ [`${CHATS}/c1`]: undefined });
  assert.ok(await transport.getBlob(root.records["chats/c1"].blob!));
});

test("a root that fails validation is not applied", async () => {
  const { a, b, server } = setup();
  await addChat(a, "c1", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  const { encodeRoot } = await import("../src/shared/sync/root");
  const root = await decodeRoot(server.root!);
  // A damaged record: a delete with a clock that is not a clock.
  root.records["chats/c1"] = { clock: "zzzz", deleted: true } as never;
  server.root = await encodeRoot(root);
  server.etag = '"damaged"';
  // Never applied: the root is rebuilt from b's data, with a note.
  const result = await b.sync();
  assert.deepEqual(result.warnings, [SYNC_WARNINGS.recoveredRoot]);
  assert.deepEqual(ids(b), ["c1"]);
  // b never held c1's content: a, which has it, uploads it again.
  assert.ok(!(await decodeRoot(server.root!)).records["chats/c1"]?.deleted);
  await a.sync();
  const repaired = await decodeRoot(server.root!);
  assert.ok(
    repaired.records["chats/c1"] && !repaired.records["chats/c1"].deleted,
  );
  assert.deepEqual(ids(a), ["c1"]);
});

test("on a server that ignores If-Match, a lost write is sent again", async () => {
  const { clock, server, a, b } = setup();
  await addChat(a, "c1", [["m1", 1]]);
  await addChat(a, "c2", [["m2", 1]]);
  await a.sync("edit");
  await b.sync();
  const before = { root: server.root, etag: server.etag };
  clock.now += 1000;
  await a.set(
    CHATS,
    a.get<Array<{ id: string }>>(CHATS).filter((item) => item.id !== "c1"),
  );
  await addChat(a, "c3", [["m3", 1]]);
  await a.sync("edit");
  // b writes from the root it read before, and the server (ignoring
  // If-Match) lets it replace a's write.
  server.root = before.root;
  server.etag = before.etag;
  await b.set(STORAGE_KEYS.language, "de-DE");
  await b.sync("edit");
  assert.ok(!(await decodeRoot(server.root!)).records["chats/c3"]);
  await a.sync();
  await b.sync();
  assert.deepEqual(ids(b), ["c2", "c3"]);
  assert.deepEqual(ids(a), ["c2", "c3"]);
  assert.equal(a.get(STORAGE_KEYS.language), "de-DE");
});

test("the weekly sweep removes old blobs no record names", async () => {
  const { clock, a, server } = setup();
  await a.set(STORAGE_KEYS.skills, [
    { id: "s", name: "S", files: [{ path: "a", content: "1" }] },
  ]);
  await a.sync("edit");
  const used = [...server.blobs.keys()];
  // Left by a round that uploaded and then failed.
  server.blobs.set("f".repeat(64), new Uint8Array([1]));
  clock.now += 8 * 24 * 60 * 60_000;
  await a.sync();
  assert.deepEqual([...server.blobs.keys()], used);
  assert.ok(server.requests.includes("DELETE blob"));
});

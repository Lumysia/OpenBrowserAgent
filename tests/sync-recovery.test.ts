import assert from "node:assert/strict";
import test from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { runSyncRound } from "../src/shared/sync/engine";
import { decodeRoot } from "../src/shared/sync/root";
import {
  ALL_ON,
  chat,
  device,
  memoryServer,
  memoryTransport,
  messageIds,
  saveChat,
  type Device,
} from "./sync-fixtures";

// Devices that come back after a while: rounds that did not run or failed,
// a cleared server, a restarted sync state, answers to the mass-delete
// guard.

const PROVIDERS = STORAGE_KEYS.provider;
const CHATS = STORAGE_KEYS.chats;
const HOUR = 60 * 60_000;

function setup() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, server, a, b };
}

const apiKey = (value: unknown) =>
  (value as { p1: { apiKey: string } }).p1.apiKey;

test("the latest edit wins after this device's rounds did not run for days", async () => {
  const { clock, a, b } = setup();
  await a.set(PROVIDERS, { p1: { apiKey: "v0" } });
  await a.sync("edit");
  await b.sync();
  // b: sync paused (or off); its edits are only recorded.
  await b.set(PROVIDERS, { p1: { apiKey: "b-day1" } });
  clock.now += 48 * HOUR;
  await a.set(PROVIDERS, { p1: { apiKey: "a-day3" } });
  await a.sync("edit");
  clock.now += 72 * HOUR;
  await b.set(PROVIDERS, { p1: { apiKey: "b-day6" } });
  await b.sync("startup");
  await a.sync();
  assert.equal(apiKey(a.get(PROVIDERS)), "b-day6");
  assert.equal(apiKey(b.get(PROVIDERS)), "b-day6");
});

test("each chat's change is stamped with that chat's latest edit", async () => {
  const { clock, a, b } = setup();
  const rename = async (on: Device, id: string, title: string) => {
    const list = on.get<Array<{ id: string }>>(CHATS);
    await on.set(
      CHATS,
      list.map((item) =>
        item.id === id ? { ...chat(id, [["m1", 1]]).summary, title } : item,
      ),
    );
    await on.set(`${CHATS}/${id}`, chat(id, [["m1", 1]]).content);
  };
  await saveChat(a, "X", [["m1", 1]]);
  await saveChat(a, "Y", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  await rename(b, "Y", "Y on b, day 1");
  clock.now += 48 * HOUR;
  await rename(a, "X", "X on a, day 3");
  await a.sync("edit");
  clock.now += 72 * HOUR;
  await rename(b, "X", "X on b, day 6");
  await b.sync("startup");
  await a.sync();
  const title = (on: Device, id: string) =>
    on
      .get<Array<{ id: string; title: string }>>(CHATS)
      .find((item) => item.id === id)?.title;
  assert.equal(title(a, "X"), "X on b, day 6");
  assert.equal(title(b, "X"), "X on b, day 6");
  assert.equal(title(a, "Y"), "Y on b, day 1");
});

test("a chat change from a failed round merges with another device's change", async () => {
  const { clock, server, a } = setup();
  let down = false;
  const base = memoryTransport(server);
  const b = device(
    "deviceB",
    {
      ...base,
      readRoot: (etag) =>
        down
          ? Promise.reject(new TypeError("fetch failed"))
          : base.readRoot(etag),
    },
    clock,
    ALL_ON,
  );
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  await b.env.local.set({ [`${CHATS}/X`]: chat("X", [["m1", 1]]).content });
  await b.sync();
  clock.now += 1000;
  down = true;
  await saveChat(b, "X", [
    ["m1", 1],
    ["b2", 2],
  ]);
  await assert.rejects(b.sync("edit"));
  down = false;
  clock.now += 1000;
  await saveChat(a, "X", [
    ["m1", 1],
    ["a3", 3],
  ]);
  await a.sync("edit");
  clock.now += 60_000;
  const result = await b.sync("poll");
  assert.deepEqual(result.warnings, []);
  await a.sync();
  assert.deepEqual(messageIds(a, "X"), ["m1", "b2", "a3"]);
  assert.deepEqual(messageIds(b, "X"), ["m1", "b2", "a3"]);
});

test("after a cloud clear, a chat's content comes back from the device that has it", async () => {
  const { clock, server, a, b } = setup();
  const c = device("deviceC", memoryTransport(server), clock, ALL_ON);
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  // Cleared by hand or from a third device; b, which never opened X, runs
  // first.
  await memoryTransport(server).clear();
  clock.now += 1000;
  await b.sync();
  await a.sync();
  await b.sync();
  await c.sync();
  const blob = (await decodeRoot(server.root!)).records["chats/X"]?.blob;
  assert.ok(blob && server.blobs.has(blob));
});

test("content the server lost is uploaded again by the weekly check of a device that has it", async () => {
  const { clock, server, a, b } = setup();
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  // A server restored from a backup without its blobs.
  server.blobs.clear();
  clock.now += 8 * 24 * HOUR;
  await b.sync();
  await a.sync();
  const blob = (await decodeRoot(server.root!)).records["chats/X"].blob!;
  assert.ok(server.blobs.has(blob));
});

test("switching to another backend and back resumes sync in both directions", async () => {
  const { clock, a, b } = setup();
  await a.set(PROVIDERS, { p1: { apiKey: "v0" } });
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await a.set(PROVIDERS, { p1: { apiKey: "a" }, p3: { apiKey: "a" } });
  await a.sync("edit");
  // b tries another backend for a while and edits there, after a did.
  const elsewhere = {
    ...b.context,
    scope: "other",
    transport: memoryTransport(memoryServer()),
  };
  clock.now += 1000;
  await b.set(PROVIDERS, { p1: { apiKey: "b" }, p2: { apiKey: "b" } });
  await runSyncRound(elsewhere, "edit");
  // Back to the first backend: b resumes instead of joining anew.
  clock.now += 1000;
  await b.sync("startup");
  await a.sync();
  const expected = {
    p1: { apiKey: "b" },
    p2: { apiKey: "b" },
    p3: { apiKey: "a" },
  };
  assert.deepEqual(a.get(PROVIDERS), expected);
  assert.deepEqual(b.get(PROVIDERS), expected);
});

test("a device joining an account where most of its chats were deleted asks first", async () => {
  const { clock, a, b } = setup();
  for (let i = 0; i < 8; i++) await saveChat(a, `c${i}`, [[`m${i}`, i]]);
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await a.set(CHATS, []);
  await a.confirmDeletes(["chats"]);
  // b joins this account anew (another folder URL for the same server).
  const joined = await runSyncRound({ ...b.context, scope: "new" }, "startup");
  assert.deepEqual(joined.massDelete, [
    { collection: "chats", count: 8, total: 8 },
  ]);
  assert.equal(b.get<unknown[]>(CHATS).length, 8);
});

test("on joining an account, the newer of two differing values wins", async () => {
  const { clock, a, b } = setup();
  const LANGUAGE = STORAGE_KEYS.language;
  await a.set(PROVIDERS, { p1: { apiKey: "account" } });
  await a.set(LANGUAGE, "de-DE");
  await a.sync("edit");
  clock.now += 1000;
  // b changed p1 after the account did; its language is older than change
  // tracking (stored without a change being recorded).
  await b.set(PROVIDERS, { p1: { apiKey: "typed on b" } });
  b.seed(LANGUAGE, "fr-FR");
  await b.sync("startup");
  await a.sync();
  for (const on of [a, b]) {
    assert.deepEqual(on.get(PROVIDERS), { p1: { apiKey: "typed on b" } });
    assert.equal(on.get(LANGUAGE), "de-DE");
  }
});

const keep = (collection: string) => ({
  massDelete: { collections: [collection], keep: true },
});

test("keeping local copies after a mass delete reverts no other device's edits", async () => {
  const { clock, a, b } = setup();
  const AGENTS = STORAGE_KEYS.agents;
  const agents = Array.from({ length: 8 }, (_, i) => ({
    id: `g${i}`,
    name: `agent ${i}`,
    createdAt: i,
  }));
  await a.set(AGENTS, agents);
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  // a deletes six agents and renames one it keeps.
  await a.set(AGENTS, [{ ...agents[6], name: "renamed on a" }, agents[7]]);
  await a.confirmDeletes(["agents"]);
  assert.ok((await b.sync()).massDelete);
  clock.now += 1000;
  await b.sync("manual", keep("agents"));
  await a.sync();
  for (const on of [a, b]) {
    const list = on.get<Array<{ id: string; name: string }>>(AGENTS);
    assert.equal(list.length, 8);
    assert.equal(list.find((agent) => agent.id === "g6")?.name, "renamed on a");
  }
});

async function deleteChatsElsewhere(waitHours: number) {
  const { clock, server, a, b } = setup();
  const c = device("deviceC", memoryTransport(server), clock, ALL_ON);
  for (let i = 0; i < 8; i++) await saveChat(a, `c${i}`, [[`m${i}`, i]]);
  await a.sync("edit");
  await b.sync(); // b holds the chat list only
  clock.now += 1000;
  await a.set(CHATS, []);
  await a.confirmDeletes(["chats"]);
  assert.ok((await b.sync()).massDelete);
  clock.now += waitHours * HOUR;
  await a.sync(); // collects garbage older than a day
  await b.sync("manual", keep("chats"));
  await c.sync();
  const root = await decodeRoot(server.root!);
  const live = Object.entries(root.records).filter(
    ([id, record]) => id.startsWith("chats/") && !record.deleted,
  );
  return { live, server, b, c };
}

test("chats kept after a mass delete come back with their content", async () => {
  const { live, server, c } = await deleteChatsElsewhere(1);
  assert.equal(live.length, 8);
  for (const [, record] of live) assert.ok(server.blobs.has(record.blob!));
  assert.equal(c.get<unknown[]>(CHATS).length, 8);
});

test("chats whose content is gone everywhere are not kept without it", async () => {
  const { live, b } = await deleteChatsElsewhere(25);
  assert.equal(live.length, 0);
  assert.deepEqual(b.get(CHATS), []);
});

test("a round that fails after applying remote changes does not send them back as its own", async () => {
  const { clock, server, a } = setup();
  let failWrite = false;
  const base = memoryTransport(server);
  const b = device(
    "deviceB",
    {
      ...base,
      writeRoot: (root, etag) =>
        failWrite
          ? Promise.reject(new TypeError("fetch failed"))
          : base.writeRoot(root, etag),
    },
    clock,
    ALL_ON,
  );
  await a.set(PROVIDERS, { p1: { apiKey: "v0" } });
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await a.set(PROVIDERS, { p1: { apiKey: "a1" } });
  await a.sync("edit");
  clock.now += 1000;
  // b applies a1, then fails to upload its own change.
  await b.set(STORAGE_KEYS.language, "fr-FR");
  failWrite = true;
  await assert.rejects(b.sync("edit"));
  failWrite = false;
  assert.equal(apiKey(b.get(PROVIDERS)), "a1");
  clock.now += 60_000;
  await a.set(PROVIDERS, { p1: { apiKey: "a2" } });
  await a.sync("edit");
  clock.now += 60_000;
  await b.sync();
  await a.sync();
  assert.equal(apiKey(a.get(PROVIDERS)), "a2");
  assert.equal(apiKey(b.get(PROVIDERS)), "a2");
  assert.equal(a.get(STORAGE_KEYS.language), "fr-FR");
});

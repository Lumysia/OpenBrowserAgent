import assert from "node:assert/strict";
import test from "node:test";
import { storageLockName } from "../src/shared/locks";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { runSyncRound } from "../src/shared/sync/engine";
import { decodeRoot } from "../src/shared/sync/root";
import {
  ALL_ON,
  chat,
  device,
  TEST_SCOPE,
  hookedTransport,
  memoryServer,
  memoryTransport,
  messageIds,
  saveChat,
  type Device,
  type MemoryServer,
} from "./sync-fixtures";

// The first review's repros (F1–F10), kept as tests. Each asserts the
// correct behaviour.

const CHATS = STORAGE_KEYS.chats;
const PROVIDERS = STORAGE_KEYS.provider;
const AGENTS = STORAGE_KEYS.agents;
const HOUR = 60 * 60_000;

function setup() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, server, a, b };
}

const rootOf = (server: MemoryServer) => decodeRoot(server.root!);

const apiKey = (on: Device) =>
  on.get<{ p1: { apiKey: string } }>(PROVIDERS).p1.apiKey;

// F3
test("review C1: an app save of a chat during an engine write is kept", async () => {
  const { clock, a, b } = setup();
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  await b.env.local.set({ [`${CHATS}/X`]: chat("X", [["m1", 1]]).content });
  await b.sync();
  clock.now += 1000;
  await saveChat(a, "X", [
    ["m1", 1],
    ["a2", 2],
  ]);
  await a.sync("edit");
  const set = b.env.local.set.bind(b.env.local);
  const mine = chat("X", [
    ["m1", 1],
    ["b3", 3],
  ]);
  let injected = false;
  b.env.local.set = async (items) => {
    if (!injected && `${CHATS}/X` in items && CHATS in items) {
      injected = true;
      const appWrite = b.env.lock(storageLockName(`${CHATS}/X`), () =>
        set({ [`${CHATS}/X`]: mine.content }),
      );
      await Promise.race([
        appWrite,
        new Promise((resolve) => setTimeout(resolve, 50)),
      ]);
    }
    return set(items);
  };
  await b.sync();
  b.env.local.set = set;
  await b.set(CHATS, [mine.summary]);
  await b.set(`${CHATS}/X`, b.get(`${CHATS}/X`));
  clock.now += 1000;
  await b.sync("edit");
  await a.sync();
  assert.ok(messageIds(b, "X").includes("b3"), "b3 kept on b");
  assert.ok(messageIds(a, "X").includes("b3"), "b3 reached a");
});

// F4
test("review C4: an edit made while a round scans is uploaded later", async () => {
  const { clock, a, b } = setup();
  await b.set(PROVIDERS, { p1: { apiKey: "k1", model: "m" } });
  await b.sync("edit");
  await a.sync();
  clock.now += 1000;
  await b.set(PROVIDERS, { p1: { apiKey: "k2", model: "m" } });
  const get = b.env.local.get.bind(b.env.local);
  let fired = false;
  b.env.local.get = async (keys) => {
    const result = await get(keys);
    if (!fired && keys === PROVIDERS) {
      fired = true;
      // The app saves; the background records it once the round lets it.
      await b.env.local.set({
        [PROVIDERS]: { p1: { apiKey: "k3", model: "m" } },
      });
    }
    return result;
  };
  await b.sync("edit");
  b.env.local.get = get;
  assert.ok(fired);
  for (let i = 0; i < 3; i++) {
    clock.now += 60_000;
    await b.sync("poll");
  }
  await a.sync();
  assert.deepEqual(a.get(PROVIDERS), { p1: { apiKey: "k3", model: "m" } });
});

// F5
test("review C5: a chat change from a failed round merges with a concurrent change", async () => {
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
  await b.sync("edit").catch(() => undefined);
  down = false;
  clock.now += 1000;
  await saveChat(a, "X", [
    ["m1", 1],
    ["a3", 3],
  ]);
  await a.sync("edit");
  for (let i = 0; i < 3; i++) {
    clock.now += 60_000;
    await b.sync("poll");
  }
  await a.sync();
  assert.ok(messageIds(a, "X").includes("b2"), "b2 reached a");
  assert.ok(messageIds(b, "X").includes("a3"), "a3 reached b");
});

// F6
test("review C6: after a cloud clear, content one device holds is available again", async () => {
  const { clock, server, a, b } = setup();
  const c = device("deviceC", memoryTransport(server), clock, ALL_ON);
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  await memoryTransport(server).clear();
  clock.now += 1000;
  await b.sync("poll");
  await a.sync("poll");
  await b.sync("poll");
  await a.sync("poll");
  await c.sync();
  const blob = (await rootOf(server)).records["chats/X"]?.blob;
  assert.ok(blob && server.blobs.has(blob), "X downloadable by a new device");
});

// F8: the residual window (a blob collected right after the root without
// it was written, while another device refers to it again) heals in that
// device's next round.
test("review C7: a collected blob another device refers to again comes back next round", async () => {
  const { clock, server, b } = setup();
  const hooked = hookedTransport(memoryTransport(server));
  const a = device("deviceA", hooked.transport, clock, ALL_ON);
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  await b.env.local.set({ [`${CHATS}/X`]: chat("X", [["m1", 1]]).content });
  await b.sync();
  clock.now += 1000;
  await saveChat(a, "X", [
    ["m1", 1],
    ["a2", 2],
  ]);
  await a.sync("edit");
  await b.sync();
  clock.now += 25 * HOUR;
  // b removes a2 again: X's content is its first blob once more, which a
  // collects (its root no longer lists it) while b's whole round runs.
  await saveChat(b, "X", [["m1", 1]]);
  hooked.hooks.deleteBlob = async () => void (await b.sync("edit"));
  await a.sync("poll");
  clock.now += 60_000;
  await b.sync("poll");
  const blob = (await rootOf(server)).records["chats/X"].blob!;
  assert.ok(server.blobs.has(blob), "the blob the root refers to exists");
  const result = await a.sync();
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(messageIds(a, "X"), ["m1"]);
});

// F7
test("review C8: mass deletion on a device whose sync state restarted waits for the user", async () => {
  const { clock, a, b } = setup();
  for (let i = 0; i < 8; i++) await saveChat(a, `c${i}`, [[`m${i}`, i]]);
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await a.set(CHATS, []);
  await a.confirmDeletes(["chats"]);
  const restarted = await runSyncRound(
    { ...b.context, scope: "test-after-switch" },
    "startup",
  );
  assert.ok(restarted.massDelete?.length, "guard asked");
  assert.equal(b.get<unknown[]>(CHATS).length, 8);
});

test("review C8b: unsynced local edits survive a sync-state restart", async () => {
  const { clock, a, b } = setup();
  await a.set(PROVIDERS, { p1: { apiKey: "old", model: "m" } });
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await b.set(PROVIDERS, { p1: { apiKey: "new-key-typed-on-b", model: "m" } });
  // The backend's cached state is gone (the keys stay with the backend).
  await b.env.local.remove(`${STORAGE_KEYS.syncState}:${TEST_SCOPE}`);
  await runSyncRound(b.context, "startup");
  await a.sync();
  assert.equal(apiKey(b), "new-key-typed-on-b");
  assert.equal(apiKey(a), "new-key-typed-on-b");
});

// F9
test("review C9: the latest edit wins after rounds did not run for a while", async () => {
  const { clock, a, b } = setup();
  await a.set(PROVIDERS, { p1: { apiKey: "v0" } });
  await a.sync("edit");
  await b.sync();
  await b.set(PROVIDERS, { p1: { apiKey: "b-day1" } });
  clock.now += 48 * HOUR;
  await a.set(PROVIDERS, { p1: { apiKey: "a-day3" } });
  await a.sync("edit");
  clock.now += 72 * HOUR;
  await b.set(PROVIDERS, { p1: { apiKey: "b-day6-latest" } });
  await b.sync("startup");
  await a.sync();
  assert.equal(apiKey(a), "b-day6-latest");
});

const keep = (on: Device, collections: string[]) =>
  on.sync("manual", { massDelete: { collections, keep: true } });

// F10
test("review C10: keeping local copies does not revert other devices' edits", async () => {
  const { clock, a, b } = setup();
  const agents = Array.from({ length: 8 }, (_, i) => ({
    id: `g${i}`,
    name: `agent ${i}`,
    createdAt: i,
  }));
  await a.set(AGENTS, agents);
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await a.set(AGENTS, [{ ...agents[6], name: "renamed on A" }, agents[7]]);
  await a.confirmDeletes(["agents"]);
  assert.ok((await b.sync()).massDelete?.length, "guard asks on b");
  clock.now += 1000;
  await keep(b, ["agents"]);
  await a.sync();
  const g6 = a
    .get<Array<{ id: string; name: string }>>(AGENTS)
    .find((agent) => agent.id === "g6");
  assert.equal(g6?.name, "renamed on A");
});

test("review C10b: chats kept after a day come back with their content", async () => {
  const { clock, server, a, b } = setup();
  const c = device("deviceC", memoryTransport(server), clock, ALL_ON);
  for (let i = 0; i < 8; i++) await saveChat(a, `c${i}`, [[`m${i}`, i]]);
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await a.set(CHATS, []);
  await a.confirmDeletes(["chats"]);
  assert.ok((await b.sync()).massDelete?.length);
  clock.now += 25 * HOUR;
  await a.sync();
  await keep(b, ["chats"]);
  await c.sync();
  const root = await rootOf(server);
  const live = Object.entries(root.records).filter(
    ([id, record]) => id.startsWith("chats/") && !record.deleted,
  );
  for (const [id, record] of live)
    assert.ok(record.blob && server.blobs.has(record.blob), id);
});

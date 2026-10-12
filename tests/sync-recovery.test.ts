import assert from "node:assert/strict";
import test from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
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
  const blob = (await c.state()).synced["chats/X"]?.blob;
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
  const blob = (await a.state()).synced["chats/X"].blob!;
  assert.ok(server.blobs.has(blob));
});

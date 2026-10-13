import assert from "node:assert/strict";
import test from "node:test";
import { loadContent } from "../src/background/sync/service";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { seenFrom } from "../src/shared/sync/clocks";
import { INITIAL_HLC, tickClock } from "../src/shared/sync/hlc";
import { decodeRoot } from "../src/shared/sync/root";
import { SYNC_WARNINGS } from "../src/shared/sync/state";
import {
  ALL_ON,
  copyOf,
  device,
  memoryServer,
  memoryTransport,
  messageIds,
  saveChat,
  type MemoryServer,
} from "./sync-fixtures";

// Review 6, C1: `seen` kept one clock per device id, so a copied profile's
// change pushed the original's out of later versions.

const PREFS = STORAGE_KEYS.preferences;
const PROVIDERS = STORAGE_KEYS.provider;
type Providers = Record<string, { apiKey: string; model: string }>;

async function longestSeen(server: MemoryServer) {
  const root = await decodeRoot(server.root!);
  return Math.max(
    ...Object.values(root.records).map((record) => record.seen?.length ?? 0),
  );
}

// The copy's clock runs ahead, so it never takes the original's clocks for
// another install's: a later version made elsewhere must still name the
// original's change, or the original merges it again from its old base and
// the message deleted since comes back.
test("review6 C1: a copied profile's change does not hide the original's from later versions", async () => {
  const clockA = { now: 1_000_000_000 };
  const clockC = { now: clockA.now + 10 * 60_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clockA, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clockA, ALL_ON);
  const t = clockA.now;
  await saveChat(a, "X", [["m0", t]]);
  await a.sync("edit");
  await b.sync();
  await loadContent(b.context, "chats", "X");
  await b.settle();
  const c = copyOf(a, memoryTransport(server), clockC, ALL_ON);
  await c.set(PREFS, { theme: "dark" });
  await c.sync("edit");
  clockA.now += 60_000;
  clockC.now += 60_000;
  await saveChat(a, "X", [
    ["m0", t],
    ["a1", clockA.now],
  ]);
  await a.sync("edit");
  // The copy adds z on top of a1, then b deletes a1.
  clockC.now += 60_000;
  const read = await c.sync();
  assert.equal(read.warnings.includes(SYNC_WARNINGS.clonedDevice), false);
  await saveChat(c, "X", [
    ["m0", t],
    ["a1", clockA.now],
    ["z", clockC.now],
  ]);
  await c.sync("edit");
  clockA.now += 120_000;
  await b.sync();
  await saveChat(b, "X", [
    ["m0", t],
    ["z", clockC.now],
  ]);
  await b.sync("edit");
  clockA.now += 60_000;
  await a.sync();
  await b.sync();
  await c.sync();
  await loadContent(c.context, "chats", "X");
  await c.settle();
  for (const on of [a, b, c])
    assert.deepEqual(messageIds(on, "X"), ["m0", "z"], on.name);
});

// a's change is older than its own later change of another record, so no
// clock is newer than a's: the copy's change is newer than a push a waits
// to confirm, and a knows it never made it.
test("review6 C1: a copy whose clocks are behind is found by a push still waiting", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  await a.set(PROVIDERS, { openai: { apiKey: "k", model: "m0" } });
  await a.sync("edit");
  const b = copyOf(a, memoryTransport(server), clock, ALL_ON);
  clock.now += 60_000;
  await a.set(PROVIDERS, { openai: { apiKey: "k2", model: "m0" } });
  clock.now += 60_000;
  await b.set(PROVIDERS, { openai: { apiKey: "k", model: "m1" } });
  await b.sync("edit");
  clock.now += 60_000;
  await a.set(PREFS, { fontSize: 12 });
  clock.now += 60_000;
  const result = await a.sync("edit");
  assert.equal(result.warnings.includes(SYNC_WARNINGS.clonedDevice), true);
  await b.sync();
  for (const on of [a, b])
    assert.deepEqual(
      on.get<Providers>(PROVIDERS).openai,
      { apiKey: "k2", model: "m1" },
      on.name,
    );
});

test("review6 C1: clocks of one device id are never pruned against each other", () => {
  const [older] = tickClock(INITIAL_HLC, "shared", 1_000);
  const [newer] = tickClock(INITIAL_HLC, "shared", 2_000);
  const [made] = tickClock(INITIAL_HLC, "other", 3_000);
  assert.deepEqual(
    seenFrom(made, [{ clock: newer, seen: [older] }], undefined),
    [older, newer],
  );
});

// Only the install that made a change asks about it: versions it makes
// leave out its own changes it no longer asks about, so `seen` stays small.
// One device names at most its push still waiting for confirmation (each
// edit here comes before the round that confirms the last one).
test("review6 seen: one device's edits name at most its waiting push, two devices about each other", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  for (let i = 0; i < 6; i++) {
    clock.now += 60_000;
    await a.set(PREFS, { fontSize: i });
    await a.sync("edit");
  }
  assert.equal(await longestSeen(server), 1);
  await a.sync();
  clock.now += 60_000;
  await a.set(PREFS, { fontSize: 9 });
  await a.sync("edit");
  assert.equal(await longestSeen(server), 0);
  await b.sync();
  const lengths: number[] = [];
  for (let i = 0; i < 12; i++) {
    clock.now += 60_000;
    await a.set(PREFS, { ...a.get<object>(PREFS), theme: `t${i}` });
    // Every third round both change it before syncing: b merges.
    if (i % 3 === 0) await b.set(PREFS, { ...b.get<object>(PREFS), n: i });
    else await a.sync("edit");
    clock.now += 60_000;
    await b.set(PREFS, { ...b.get<object>(PREFS), fontSize: 20 + i });
    await b.sync("edit");
    await a.sync();
    lengths.push(await longestSeen(server));
  }
  assert.ok(Math.max(...lengths) <= 3, `seen lengths ${lengths}`);
  assert.deepEqual(a.get(PREFS), b.get(PREFS));
});

import assert from "node:assert/strict";
import test from "node:test";
import { loadContent } from "../src/background/sync/service";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import type { Root } from "../src/shared/sync/root";
import { SYNC_WARNINGS } from "../src/shared/sync/state";
import type { Transport } from "../src/shared/sync/transport";
import {
  ALL_ON,
  device,
  memoryServer,
  memoryTransport,
  messageIds,
  saveChat,
  type Device,
} from "./sync-fixtures";

// Review 6, L1: a root write that lands while its answer is lost (the 30 s
// timeout, the browser closed or the connection dropped while waiting).

const PREFS = STORAGE_KEYS.preferences;

// A root write the server applies but whose answer never arrives.
function lostAck(base: Transport) {
  const state = { armed: false };
  const transport: Transport = {
    ...base,
    async writeRoot(root, etag) {
      const result = await base.writeRoot(root, etag);
      if (state.armed) {
        state.armed = false;
        throw new Error("timeout");
      }
      return result;
    },
  };
  return { transport, state };
}

async function joined(clock: { now: number }) {
  const server = memoryServer();
  const lost = lostAck(memoryTransport(server));
  const a = device("deviceA", lost.transport, clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  await saveChat(a, "X", [["m0", clock.now]]);
  await a.sync("edit");
  await b.sync();
  await loadContent(b.context, "chats", "X");
  await b.settle();
  return { server, lost, a, b };
}

const opened = async (on: Device) => {
  await loadContent(on.context, "chats", "X");
  await on.settle();
};

test("review6 L1: a reply regenerated after a lost write answer does not come back", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const lost = lostAck(memoryTransport(server));
  const a = device("deviceA", lost.transport, clock, ALL_ON);
  const t = clock.now;
  await saveChat(a, "X", [["m0", t]]);
  await a.sync("edit");
  clock.now += 60_000;
  await saveChat(a, "X", [
    ["m0", t],
    ["r1", clock.now],
  ]);
  lost.state.armed = true;
  await assert.rejects(a.sync("edit"));
  // The user regenerates the reply: r1 is replaced by r2.
  clock.now += 60_000;
  await saveChat(a, "X", [
    ["m0", t],
    ["r2", clock.now],
  ]);
  clock.now += 60_000;
  await a.sync("edit");
  await a.sync();
  assert.deepEqual(messageIds(a, "X"), ["m0", "r2"]);
});

test("review6 L1: the other device gets the regenerated reply only", async () => {
  const clock = { now: 1_000_000_000 };
  const t = clock.now;
  const { lost, a, b } = await joined(clock);
  clock.now += 60_000;
  await saveChat(a, "X", [
    ["m0", t],
    ["r1", clock.now],
  ]);
  lost.state.armed = true;
  await assert.rejects(a.sync("edit"));
  await b.sync();
  clock.now += 60_000;
  await saveChat(a, "X", [
    ["m0", t],
    ["r2", clock.now],
  ]);
  clock.now += 60_000;
  await a.sync("edit");
  await b.sync();
  await a.sync();
  for (const on of [a, b])
    assert.deepEqual(messageIds(on, "X"), ["m0", "r2"], on.name);
});

test("review6 L1: a setting changed back after a lost write answer stays changed back", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const lost = lostAck(memoryTransport(server));
  const a = device("deviceA", lost.transport, clock, ALL_ON);
  await a.set(PREFS, { theme: "light" });
  await a.sync("edit");
  clock.now += 60_000;
  await a.set(PREFS, { theme: "dark" });
  lost.state.armed = true;
  await assert.rejects(a.sync("edit"));
  clock.now += 60_000;
  await a.set(PREFS, { theme: "light" });
  clock.now += 60_000;
  await a.sync("edit");
  await a.sync();
  assert.equal(a.get<{ theme: string }>(PREFS).theme, "light");
});

// The other device changes the chat on top of the version whose answer was
// lost: the merge must compare with that version (kept with the push), not
// with the one before it.
test("review6 L1: a change made elsewhere on top of a lost-answer write merges from that write", async () => {
  const clock = { now: 1_000_000_000 };
  const t = clock.now;
  const { lost, a, b } = await joined(clock);
  clock.now += 60_000;
  const r1 = clock.now;
  await saveChat(a, "X", [
    ["m0", t],
    ["r1", r1],
  ]);
  lost.state.armed = true;
  await assert.rejects(a.sync("edit"));
  clock.now += 60_000;
  await b.sync();
  await opened(b);
  await saveChat(b, "X", [
    ["m0", t],
    ["r1", r1],
    ["b2", clock.now],
  ]);
  await b.sync("edit");
  clock.now += 60_000;
  await saveChat(a, "X", [
    ["m0", t],
    ["r2", clock.now],
  ]);
  clock.now += 60_000;
  await a.sync("edit");
  await b.sync();
  await a.sync();
  for (const on of [a, b])
    assert.deepEqual(messageIds(on, "X").sort(), ["b2", "m0", "r2"], on.name);
});

// The lost write reaches a server that ignores If-Match only after the
// next write: the root goes back to it. The change made on top of it is
// pushed again as it is, not merged with it from the older version.
test("review6 L1: a lost write that lands after a later one is not merged into it again", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const base = memoryTransport(server, { ignoreIfMatch: true });
  const late: { armed: boolean; root?: Root } = { armed: false };
  const transport: Transport = {
    ...base,
    async writeRoot(root, etag) {
      if (!late.armed) return base.writeRoot(root, etag);
      late.armed = false;
      late.root = root;
      throw new Error("timeout");
    },
  };
  const a = device("deviceA", transport, clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  const t = clock.now;
  await saveChat(a, "X", [["m0", t]]);
  await a.sync("edit");
  clock.now += 60_000;
  await saveChat(a, "X", [
    ["m0", t],
    ["r1", clock.now],
  ]);
  late.armed = true;
  await assert.rejects(a.sync("edit"));
  clock.now += 60_000;
  await saveChat(a, "X", [
    ["m0", t],
    ["r2", clock.now],
  ]);
  await a.sync("edit");
  // The first write arrives now.
  await base.writeRoot(late.root!, undefined);
  clock.now += 60_000;
  await a.sync();
  await b.sync();
  await opened(b);
  for (const on of [a, b])
    assert.deepEqual(messageIds(on, "X"), ["m0", "r2"], on.name);
});

// Everyday use around lost answers never takes this install for a copy.
test("review6 L1: lost answers and pending pushes never look like a copied profile", async () => {
  const clock = { now: 1_000_000_000 };
  const t = clock.now;
  const { lost, a, b } = await joined(clock);
  const warnings: string[] = [];
  const run = async (on: Device, edit = false) =>
    warnings.push(...(await on.sync(edit ? "edit" : "poll")).warnings);
  for (let round = 1; round <= 4; round++) {
    clock.now += 60_000;
    await saveChat(a, "X", [
      ["m0", t],
      [`r${round}`, clock.now],
    ]);
    await a.set(PREFS, {
      ...a.get<object>(PREFS),
      theme: round % 2 ? "dark" : "light",
    });
    lost.state.armed = round % 2 === 1;
    await (lost.state.armed ? run(a, true).catch(() => 0) : run(a, true));
    clock.now += 60_000;
    await b.set(PREFS, { ...b.get<object>(PREFS), fontSize: 10 + round });
    await run(b, true);
    await run(a);
  }
  assert.equal(warnings.includes(SYNC_WARNINGS.clonedDevice), false);
  await b.sync();
  await opened(b);
  for (const on of [a, b]) {
    assert.deepEqual(messageIds(on, "X"), ["m0", "r4"], on.name);
    assert.deepEqual(on.get(PREFS), { theme: "light", fontSize: 14 }, on.name);
  }
});

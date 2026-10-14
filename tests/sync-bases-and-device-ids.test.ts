import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createSyncRunner, loadContent } from "../src/background/sync/service";
import { includes } from "../src/shared/sync/clocks";
import { loadDeviceId } from "../src/shared/sync/device";
import {
  compareClocks,
  formatClock,
  INITIAL_HLC,
  isClock,
  parseClock,
  tickClock,
} from "../src/shared/sync/hlc";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { mergeChanges } from "../src/shared/sync/merge-content";
import { decodeRoot } from "../src/shared/sync/root";
import { loadSyncStatus, SYNC_WARNINGS } from "../src/shared/sync/state";
import type { Transport } from "../src/shared/sync/transport";
import {
  ALL_ON,
  chat,
  copyOf,
  device,
  memoryServer,
  memoryTransport,
  messageIds,
  saveChat,
  type Device,
} from "./sync-fixtures";

const DAY = 24 * 60 * 60_000;
const PREFS = STORAGE_KEYS.preferences;
const PROVIDERS = STORAGE_KEYS.provider;
const BASES = `${STORAGE_KEYS.syncBases}:chats`;
type Providers = Record<string, { apiKey: string; model: string }>;

// A transport whose next root read comes without a usable ETag: the round
// merges what it read and stops before uploading anything (as with a
// server whose ETags turned unreliable, or a round cut off before its
// upload).
function stopsBeforeUpload(base: Transport) {
  const state = { armed: false };
  const transport: Transport = {
    ...base,
    async readRoot(etag) {
      const read = await base.readRoot(etag);
      if (!state.armed || read.status !== "ok") return read;
      state.armed = false;
      return { ...read, etag: undefined };
    },
  };
  return { transport, state };
}

// b keeps writing until the server collected what no record refers to.
async function collect(b: Device, clock: { now: number }) {
  clock.now += 2 * DAY;
  for (let i = 0; i < 2; i++) {
    clock.now += 60_000;
    await b.set(PREFS, { ...(b.get<object>(PREFS) ?? {}), n: i });
    await b.sync("edit");
  }
}

test("review5 R1: a merge never uploaded keeps its base after the server collected it", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const stopping = stopsBeforeUpload(memoryTransport(server));
  const a = device("deviceA", stopping.transport, clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  const t = clock.now;
  await saveChat(a, "X", [
    ["m0", t],
    ["m1", t + 1],
  ]);
  await a.sync("edit");
  await b.sync();
  assert.equal(await loadContent(b.context, "chats", "X"), true);
  await b.settle();
  clock.now += 60_000;
  await saveChat(a, "X", [
    ["m0", t],
    ["m1", t + 1],
    ["a1", clock.now],
  ]);
  clock.now += 60_000;
  await saveChat(b, "X", [
    ["m0", t],
    ["m1", t + 1],
    ["b1", clock.now],
  ]);
  await b.sync("edit");
  const theirs = (await decodeRoot(server.root!)).records["chats/X"].blob!;
  clock.now += 60_000;
  // a merges both, but uploads nothing.
  stopping.state.armed = true;
  await a.sync("edit");
  assert.deepEqual(messageIds(a, "X").sort(), ["a1", "b1", "m0", "m1"]);
  assert.ok(a.get<string[]>(BASES).includes(theirs));
  // b deletes m1; the server collects b's earlier version.
  clock.now += 60_000;
  await saveChat(b, "X", [
    ["m0", t],
    ["b1", clock.now - 120_000],
  ]);
  await b.sync("edit");
  await collect(b, clock);
  assert.equal(server.blobs.has(theirs), false);
  clock.now += 60_000;
  await a.sync("startup");
  clock.now += 60_000;
  await b.sync();
  await loadContent(b.context, "chats", "X");
  await b.settle();
  for (const on of [a, b])
    assert.deepEqual(messageIds(on, "X").sort(), ["a1", "b1", "m0"], on.name);
  await a.sync();
  assert.equal(a.get(BASES), undefined);
});

test("review5 R1: copies kept against remote deletions keep their base, also for an edit no event recorded", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const stopping = stopsBeforeUpload(memoryTransport(server));
  const a = device("deviceA", stopping.transport, clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  const c = device("deviceC", memoryTransport(server), clock, ALL_ON);
  const t = clock.now;
  const ids = ["X0", "X1", "X2", "X3", "X4", "X5"];
  for (const id of ids)
    await saveChat(a, id, [
      [`${id}m0`, t],
      [`${id}m1`, t + 1],
    ]);
  await a.sync("edit");
  await b.sync();
  await c.sync();
  for (const id of ids) await loadContent(c.context, "chats", id);
  await c.settle();
  const shared = (await decodeRoot(server.root!)).records["chats/X0"].blob!;
  // b deletes every chat; a and c keep theirs, a uploads nothing.
  clock.now += 60_000;
  await b.set(STORAGE_KEYS.chats, []);
  await b.confirmDeletes(["chats"]);
  clock.now += 60_000;
  stopping.state.armed = true;
  const keep = { massDelete: { collections: ["chats"], keep: true } };
  await a.sync("poll", keep);
  assert.ok(a.get<string[]>(BASES).includes(shared));
  clock.now += 60_000;
  await c.sync("poll", keep);
  // c removes a message; the server collects the shared version.
  clock.now += 60_000;
  await saveChat(c, "X0", [["X0m0", t]]);
  await c.sync("edit");
  await collect(c, clock);
  assert.equal(server.blobs.has(shared), false);
  // a adds a message while its background is stopped (no edit event).
  const { summary, content } = chat("X0", [
    ["X0m0", t],
    ["X0m1", t + 1],
    ["X0a1", clock.now],
  ]);
  a.seed(STORAGE_KEYS.chats, [
    ...a
      .get<Array<{ id: string }>>(STORAGE_KEYS.chats)
      .filter((item) => item.id !== "X0"),
    summary,
  ]);
  a.seed(`${STORAGE_KEYS.chats}/X0`, content);
  clock.now += 60_000;
  await a.sync("startup");
  clock.now += 60_000;
  await c.sync();
  for (const on of [a, c])
    assert.deepEqual(messageIds(on, "X0").sort(), ["X0a1", "X0m0"], on.name);
});

// The edit lands while the root write runs, and no event records it (the
// background stopped): only the push itself keeps the pushed version.
test("review5 R1: an edit no event recorded, made while a push runs, keeps the pushed version", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const base = memoryTransport(server);
  let gap: (() => Promise<void>) | undefined;
  const a = device(
    "deviceA",
    {
      ...base,
      async writeRoot(root, etag) {
        const written = await base.writeRoot(root, etag);
        const run = gap;
        gap = undefined;
        await run?.();
        return written;
      },
    },
    clock,
    ALL_ON,
  );
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  const t = clock.now;
  await saveChat(a, "X", [["m0", t]]);
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  await saveChat(a, "X", [
    ["m0", t],
    ["m1", clock.now],
  ]);
  const later = clock.now + 30_000;
  gap = async () => {
    const { content } = chat("X", [
      ["m0", t],
      ["m1", later - 30_000],
      ["a2", later],
    ]);
    a.seed(`${STORAGE_KEYS.chats}/X`, content);
  };
  await a.sync("edit");
  const pushed = (await decodeRoot(server.root!)).records["chats/X"].blob!;
  assert.ok(a.get<string[]>(BASES).includes(pushed));
  // b removes m1 from the pushed version; the server collects it.
  clock.now += 60_000;
  await b.sync();
  assert.equal(await loadContent(b.context, "chats", "X"), true);
  await b.settle();
  clock.now += 60_000;
  await saveChat(b, "X", [["m0", t]]);
  await b.sync("edit");
  await collect(b, clock);
  assert.equal(server.blobs.has(pushed), false);
  clock.now += 60_000;
  await a.sync("startup");
  clock.now += 60_000;
  await b.sync();
  await loadContent(b.context, "chats", "X");
  await b.settle();
  for (const on of [a, b])
    assert.deepEqual(messageIds(on, "X").sort(), ["a2", "m0"], on.name);
});

test("review5 R2: two installs sharing a device id keep each other's concurrent edits", async () => {
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
  await a.sync("edit");
  await b.sync();
  for (const on of [a, b])
    assert.deepEqual(
      on.get<Providers>(PROVIDERS).openai,
      { apiKey: "k2", model: "m1" },
      on.name,
    );
});

// a and b are two installs with the same id; a's change is older than a
// later change of another record on a, and a waits for no push it made, so
// nothing tells the copy apart.
test("review5 R2: a change of the other install is merged even when its clock is not newer than this one's", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  await a.set(PROVIDERS, { openai: { apiKey: "k", model: "m0" } });
  await a.sync("edit");
  await a.sync();
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
  assert.equal(result.warnings.includes(SYNC_WARNINGS.clonedDevice), false);
  await b.sync();
  for (const on of [a, b])
    assert.deepEqual(
      on.get<Providers>(PROVIDERS).openai,
      { apiKey: "k2", model: "m1" },
      on.name,
    );
});

// Both installs took in a clock from a device whose time runs ahead: their
// next changes get the same wall time and counter.
test("review5 R2: two installs with the same id never stamp two changes with one clock", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const ahead = device("deviceZ", memoryTransport(server), clock, ALL_ON);
  clock.now += 10 * 60_000;
  await ahead.set(PROVIDERS, { openai: { apiKey: "k", model: "m0" } });
  await ahead.sync("edit");
  clock.now -= 10 * 60_000;
  await a.sync();
  const b = copyOf(a, memoryTransport(server), clock, ALL_ON);
  await a.set(PROVIDERS, {
    openai: { apiKey: "k", model: "m0", baseUrl: "https://a.test" },
  });
  await b.set(PROVIDERS, { openai: { apiKey: "k", model: "m1" } });
  const clocks = `${STORAGE_KEYS.syncClocks}:providers`;
  const stamp = (on: Device) =>
    on.get<Record<string, { clock: string }>>(clocks).openai.clock;
  assert.equal(stamp(a).slice(0, 20), stamp(b).slice(0, 20));
  assert.notEqual(stamp(a), stamp(b));
  await b.sync("edit");
  await a.sync("edit");
  await b.sync();
  for (const on of [a, b])
    assert.deepEqual(
      on.get<Providers>(PROVIDERS).openai,
      { apiKey: "k", model: "m1", baseUrl: "https://a.test" },
      on.name,
    );
});

test("review5 R2: an install that finds its id used elsewhere takes a new one and says so for a day", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const runner = createSyncRunner(
    a.env,
    () => undefined,
    async () => ({ ...a.context, device: await loadDeviceId(a.env) }),
  );
  await a.set(PROVIDERS, { openai: { apiKey: "k", model: "m0" } });
  await runner.request({ reason: "edit" });
  await a.settle();
  const b = copyOf(a, memoryTransport(server), clock, ALL_ON);
  const status = () => loadSyncStatus(a.env.local);
  assert.deepEqual((await status()).warnings, []);
  clock.now += 60_000;
  await a.set(PROVIDERS, {
    openai: { apiKey: "k2", model: "m0", baseUrl: "https://a.test" },
  });
  clock.now += 60_000;
  await b.set(PROVIDERS, { openai: { apiKey: "k", model: "m1" } });
  await b.sync("edit");
  clock.now += 60_000;
  await runner.request({ reason: "edit" });
  await a.settle();
  const renamed = a.get<string>(STORAGE_KEYS.syncDeviceId);
  assert.notEqual(renamed, "deviceA");
  assert.deepEqual((await status()).warnings, [SYNC_WARNINGS.clonedDevice]);
  // The merge made in that round already carries the new id.
  const merged = (await decodeRoot(server.root!)).records["providers/openai"];
  assert.deepEqual(merged.data, { model: "m1", baseUrl: "https://a.test" });
  assert.equal(parseClock(merged.clock)?.device, renamed);
  // The API key syncs apart, encrypted.
  assert.deepEqual(a.get<Providers>(PROVIDERS).openai, {
    apiKey: "k2",
    model: "m1",
    baseUrl: "https://a.test",
  });
  // The note stays for a day.
  clock.now += 60_000;
  await runner.request({ reason: "poll" });
  assert.deepEqual((await status()).warnings, [SYNC_WARNINGS.clonedDevice]);
  assert.equal(a.get<string>(STORAGE_KEYS.syncDeviceId), renamed);
  clock.now += DAY;
  await runner.request({ reason: "poll" });
  assert.deepEqual((await status()).warnings, []);
});

test("review5 R2: clocks carry a nonce per change and still order by time", () => {
  const [first, state] = tickClock(INITIAL_HLC, "a", 1000);
  const [again] = tickClock(INITIAL_HLC, "a", 1000);
  assert.notEqual(first, again);
  assert.ok(isClock(first) && isClock(formatClock(1000, 0, "a")));
  assert.equal(parseClock(first)?.device, "a");
  const [second] = tickClock(state, "a", 999);
  assert.ok(compareClocks(first, second) < 0);
  assert.ok(compareClocks(formatClock(1000, 0, "a"), first) < 0);
  assert.equal(includes({ clock: second, seen: [first] }, first), true);
  assert.equal(includes({ clock: second }, first), false);
});

// Records uploaded again after a "keep" answer say what they include, so a
// device whose push they hold counts it as confirmed.
test("review5 seen: copies kept against deletions confirm the push they hold", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const [a, b, c] = ["deviceA", "deviceB", "deviceC"].map((name) =>
    device(name, memoryTransport(server), clock, ALL_ON),
  );
  const providers = (model: string) =>
    Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((id) => [
        `p${id}`,
        { apiKey: "k", model: id === 1 ? model : "m" },
      ]),
    );
  await a.set(PROVIDERS, providers("m"));
  await a.sync("edit");
  await b.sync();
  await c.sync();
  clock.now += 60_000;
  await c.set(PROVIDERS, providers("m1"));
  await c.sync("edit");
  clock.now += 60_000;
  await a.sync();
  // c puts the model back before its next round.
  clock.now += 60_000;
  await c.set(PROVIDERS, providers("m"));
  clock.now += 60_000;
  await b.set(PROVIDERS, {});
  await b.confirmDeletes(["providers"]);
  clock.now += 60_000;
  await a.sync("poll", {
    massDelete: { collections: ["providers"], keep: true },
  });
  clock.now += 60_000;
  await c.sync("edit");
  await a.sync();
  await b.sync();
  for (const on of [a, b, c])
    assert.equal(on.get<Providers>(PROVIDERS).p1?.model, "m", on.name);
});

test("review5 merge: a list reordered on one side keeps that order", () => {
  const item = (id: string, name = id) => ({ id, name });
  const base = { list: [item("a"), item("b"), item("c")] };
  const added = { list: [item("a"), item("b", "B"), item("c"), item("d")] };
  const moved = { list: [item("c"), item("a"), item("b")] };
  const ids = (value: { list: Array<{ id: string }> }) =>
    value.list.map((entry) => entry.id);
  for (const [preferred, other] of [
    [added, moved],
    [moved, added],
  ]) {
    const merged = mergeChanges(base, preferred, other);
    assert.deepEqual(ids(merged), ["c", "a", "b", "d"]);
    assert.equal(merged.list[2].name, "B");
  }
  // Both reordered: the preferred side's order.
  const swapped = { list: [item("b"), item("a"), item("c")] };
  assert.deepEqual(ids(mergeChanges(base, swapped, moved)), ["b", "a", "c"]);
});

// Every clock write keeps the bodies its unconfirmed changes need: none
// stores the clocks key itself except saveClocks.
test("review5 R1: clock entries are stored only through saveClocks", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : /\.tsx?$/.test(entry.name)
          ? [join(dir, entry.name)]
          : [],
    );
  const writers = files("src").filter((file) =>
    /\[\s*clocksKey\(/.test(readFileSync(file, "utf8")),
  );
  assert.deepEqual(writers, [join("src", "shared", "sync", "bases.ts")]);
});

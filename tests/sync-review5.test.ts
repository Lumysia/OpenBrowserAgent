import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { loadContent } from "../src/background/sync/service";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { decodeRoot } from "../src/shared/sync/root";
import {
  ALL_ON,
  chat,
  device,
  hookedTransport,
  memoryServer,
  memoryTransport,
  messageIds,
  saveChat,
  type Device,
} from "./sync-fixtures";

const DAY = 24 * 60 * 60_000;
const PREFS = STORAGE_KEYS.preferences;
const BASES = `${STORAGE_KEYS.syncBases}:chats`;

// b keeps writing until the server collected what no record refers to.
async function collect(b: Device, clock: { now: number }) {
  clock.now += 2 * DAY;
  for (let i = 0; i < 2; i++) {
    clock.now += 60_000;
    await b.set(PREFS, { ...(b.get<object>(PREFS) ?? {}), n: i });
    await b.sync("edit");
  }
}

test("review5 R1: a merge whose root write failed keeps its base after the server collected it", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const hooked = hookedTransport(memoryTransport(server));
  const a = device("deviceA", hooked.transport, clock, ALL_ON);
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
  // a merges both, but its root write never arrives (offline).
  hooked.hooks.writeRoot = async () => {
    throw new Error("offline");
  };
  await a.sync("edit").catch(() => undefined);
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
  const hooked = hookedTransport(memoryTransport(server));
  const a = device("deviceA", hooked.transport, clock, ALL_ON);
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
  // b deletes every chat; a and c keep theirs, a's upload never arrives.
  clock.now += 60_000;
  await b.set(STORAGE_KEYS.chats, []);
  await b.confirmDeletes(["chats"]);
  clock.now += 60_000;
  hooked.hooks.writeRoot = async () => {
    throw new Error("offline");
  };
  const keep = { massDelete: { collections: ["chats"], keep: true } };
  await a.sync("poll", keep).catch(() => undefined);
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

test("review5 R1: an edit made between a root write and marking it sent keeps the pushed version", async () => {
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
  gap = () =>
    saveChat(a, "X", [
      ["m0", t],
      ["m1", later - 30_000],
      ["a2", later],
    ]);
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

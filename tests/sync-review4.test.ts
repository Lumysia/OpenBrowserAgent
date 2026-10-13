import assert from "node:assert/strict";
import test from "node:test";
import { loadContent } from "../src/background/sync/service";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { mergeFields } from "../src/shared/sync/plan";
import { decodeRoot } from "../src/shared/sync/root";
import {
  ALL_ON,
  device,
  memoryServer,
  memoryTransport,
  messageIds,
  saveChat,
  type Device,
  type MemoryServer,
} from "./sync-fixtures";

const PREFS = STORAGE_KEYS.preferences;
const PROVIDERS = STORAGE_KEYS.provider;
const MCP = STORAGE_KEYS.mcpServers;
const DAY = 24 * 60 * 60_000;
type Providers = Record<string, { apiKey: string; model: string }>;

function pair() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, server, a, b };
}

// b keeps working while a is closed: `count` edit rounds, each one root write.
async function busy(b: Device, clock: { now: number }, count: number) {
  for (let i = 0; i < count; i++) {
    clock.now += 60_000;
    const prefs = b.get<Record<string, unknown>>(PREFS) ?? {};
    await b.set(PREFS, { ...prefs, fontSize: 10 + (i % 7), n: i });
    await b.sync("edit");
  }
}

const remoteRecord = async (server: MemoryServer, recordId: string) =>
  (await decodeRoot(server.root!)).records[recordId];

for (const writes of [5, 40]) {
  test(`review4 H1: a reverted provider field stays reverted after ${writes} writes by the other device`, async () => {
    const { clock, a, b } = pair();
    await a.set(PROVIDERS, { openai: { apiKey: "k", model: "m0" } });
    await a.sync("edit");
    await b.sync();
    clock.now += 60_000;
    // a changes the model; its next round is far away (browser closed).
    await a.set(PROVIDERS, { openai: { apiKey: "k", model: "m1" } });
    await a.sync("edit");
    clock.now += 60_000;
    await b.sync();
    assert.equal(b.get<Providers>(PROVIDERS).openai.model, "m1");
    // b puts the model back.
    clock.now += 60_000;
    await b.set(PROVIDERS, { openai: { apiKey: "k", model: "m0" } });
    await b.sync("edit");
    await busy(b, clock, writes);
    clock.now += 60_000;
    await a.sync("startup");
    await b.sync();
    assert.deepEqual(
      [a, b].map((on) => on.get<Providers>(PROVIDERS).openai.model),
      ["m0", "m0"],
    );
  });

  test(`review4 H1b: a message removed on the other device stays removed after ${writes} writes`, async () => {
    const { clock, a, b } = pair();
    await saveChat(a, "X", [["m1", 1]]);
    await a.sync("edit");
    await b.sync();
    assert.equal(await loadContent(b.context, "chats", "X"), true);
    await b.settle();
    clock.now += 60_000;
    await saveChat(a, "X", [
      ["m1", 1],
      ["a1", 2],
    ]);
    await a.sync("edit");
    clock.now += 60_000;
    await b.sync();
    assert.deepEqual(messageIds(b, "X"), ["m1", "a1"]);
    // b regenerates the reply: a1 replaced by a2.
    clock.now += 60_000;
    await saveChat(b, "X", [
      ["m1", 1],
      ["a2", 3],
    ]);
    await b.sync("edit");
    await busy(b, clock, writes);
    clock.now += 2 * DAY;
    await a.sync("startup");
    clock.now += 60_000;
    await b.sync();
    assert.deepEqual(
      [a, b].map((on) => messageIds(on, "X")),
      [
        ["m1", "a2"],
        ["m1", "a2"],
      ],
    );
  });
}

type Provider = { apiKey: string; model: string };
const provider = (on: Device) =>
  on.get<Record<string, Provider>>(PROVIDERS).openai;

// a pushed a change, then made another before any read confirmed the push.
test("review4 H1: a change made after an unconfirmed push merges from the pushed version", async () => {
  const { clock, a, b } = pair();
  await a.set(PROVIDERS, { openai: { apiKey: "k", model: "m0" } });
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  await a.set(PROVIDERS, { openai: { apiKey: "k", model: "m1" } });
  await a.sync("edit");
  clock.now += 60_000;
  await a.set(PROVIDERS, { openai: { apiKey: "k2", model: "m1" } });
  await b.sync();
  clock.now += 60_000;
  await b.set(PROVIDERS, { openai: { apiKey: "k", model: "m0" } });
  await b.sync("edit");
  await busy(b, clock, 40);
  clock.now += 60_000;
  await a.sync("startup");
  await b.sync();
  for (const on of [a, b])
    assert.deepEqual(provider(on), { apiKey: "k2", model: "m0" }, on.name);
});

// b merged a's push with its own change, then undid a's part.
test("review4 H1: a version merged from a push on the other device includes it", async () => {
  const { clock, a, b } = pair();
  await a.set(PROVIDERS, { openai: { apiKey: "k", model: "m0" } });
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  await a.set(PROVIDERS, { openai: { apiKey: "k", model: "m1" } });
  await a.sync("edit");
  clock.now += 60_000;
  await b.set(PROVIDERS, { openai: { apiKey: "k2", model: "m0" } });
  await b.sync("edit");
  assert.deepEqual(provider(b), { apiKey: "k2", model: "m1" });
  await b.sync();
  clock.now += 60_000;
  await b.set(PROVIDERS, { openai: { apiKey: "k2", model: "m0" } });
  await b.sync("edit");
  await busy(b, clock, 40);
  clock.now += 60_000;
  await a.sync("startup");
  await b.sync();
  for (const on of [a, b])
    assert.deepEqual(provider(on), { apiKey: "k2", model: "m0" }, on.name);
});

// The background stopped between the root write and recording the push.
test("review4 H1: a remote version made from this device's change is applied without its record of the push", async () => {
  const { clock, a, b } = pair();
  await a.set(PROVIDERS, { openai: { apiKey: "k", model: "m0" } });
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  await a.set(PROVIDERS, { openai: { apiKey: "k", model: "m1" } });
  await a.sync("edit");
  const clocks = a.get<Record<string, { sent?: unknown }>>(
    `${STORAGE_KEYS.syncClocks}:providers`,
  );
  assert.ok(clocks.openai.sent);
  delete clocks.openai.sent;
  a.seed(`${STORAGE_KEYS.syncClocks}:providers`, clocks);
  await b.sync();
  clock.now += 60_000;
  await b.set(PROVIDERS, { openai: { apiKey: "k", model: "m0" } });
  await b.sync("edit");
  clock.now += 60_000;
  await a.sync("startup");
  await b.sync();
  assert.deepEqual(
    [a, b].map((on) => provider(on).model),
    ["m0", "m0"],
  );
});

// A change made while offline for days: the version it was made from is
// collected on the server meanwhile, and the other device regenerated a
// reply. The merge still knows what was there before.
test("review4 S2: a change older than the blob grace period merges with the version it was made from", async () => {
  const { clock, server, a, b } = pair();
  const t = clock.now;
  await saveChat(a, "X", [
    ["m0", t],
    ["m1", t + 1],
  ]);
  await a.sync("edit");
  const base = (await remoteRecord(server, "chats/X")).blob!;
  await b.sync();
  assert.equal(await loadContent(b.context, "chats", "X"), true);
  await b.settle();
  // a, offline, adds a message; b regenerates the reply m1 as m2.
  clock.now += 60_000;
  await saveChat(a, "X", [
    ["m0", t],
    ["m1", t + 1],
    ["a1", clock.now],
  ]);
  clock.now += 60_000;
  await saveChat(b, "X", [
    ["m0", t],
    ["m2", clock.now],
  ]);
  await b.sync("edit");
  clock.now += 2 * DAY;
  await busy(b, clock, 1);
  assert.equal(server.blobs.has(base), false);
  clock.now += 60_000;
  await a.sync("startup");
  clock.now += 60_000;
  await b.sync();
  for (const on of [a, b])
    assert.deepEqual(messageIds(on, "X").sort(), ["a1", "m0", "m2"], on.name);
});

test("review4 S2: the kept version is used once the shared one is collected, and dropped once confirmed", async () => {
  const { clock, server, a, b } = pair();
  const t = clock.now;
  await saveChat(a, "X", [
    ["m0", t],
    ["m1", t + 1],
  ]);
  await a.sync("edit");
  const base = (await remoteRecord(server, "chats/X")).blob!;
  await b.sync();
  await a.sync();
  assert.equal(await loadContent(b.context, "chats", "X"), true);
  await b.settle();
  clock.now += 60_000;
  await saveChat(a, "X", [
    ["m0", t],
    ["m1", t + 1],
    ["a1", clock.now],
  ]);
  const BASES = `${STORAGE_KEYS.syncBases}:chats`;
  assert.equal(a.get<Record<string, { blob: string }>>(BASES).X.blob, base);
  clock.now += 60_000;
  await saveChat(b, "X", [
    ["m0", t],
    ["m2", clock.now],
  ]);
  await b.sync("edit");
  clock.now += 2 * DAY;
  await busy(b, clock, 1);
  assert.equal(server.blobs.has(base), false);
  clock.now += 60_000;
  await a.sync("startup");
  clock.now += 60_000;
  await b.sync();
  await a.sync();
  for (const on of [a, b])
    assert.deepEqual(messageIds(on, "X").sort(), ["a1", "m0", "m2"], on.name);
  assert.equal(a.get(BASES), undefined);
});

const mcpServer = (headers: Record<string, string>) => ({
  id: "s1",
  name: "s1",
  description: "",
  url: "https://s1.example/mcp",
  enabled: false,
  headers,
  tools: [],
  lastTestError: "",
  createdAt: 1,
  updatedAt: 1,
});

test("review4 S1: headers added to one MCP server on two devices are both kept", async () => {
  const { clock, a, b } = pair();
  await a.set(MCP, [mcpServer({ Authorization: "t" })]);
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  await a.set(MCP, [mcpServer({ Authorization: "t", "X-A": "1" })]);
  clock.now += 60_000;
  await b.set(MCP, [mcpServer({ Authorization: "t", "X-B": "2" })]);
  await b.sync("edit");
  clock.now += 60_000;
  await a.sync("edit");
  await b.sync();
  for (const on of [a, b])
    assert.deepEqual(
      on.get<Array<{ headers: object }>>(MCP)[0].headers,
      { Authorization: "t", "X-A": "1", "X-B": "2" },
      on.name,
    );
});

test("review4 S1: the field merge goes into nested objects and lists by id", () => {
  const headers = mergeFields(
    { name: "s", headers: { Authorization: "t" } },
    { name: "s", headers: { Authorization: "t", "X-A": "1" } },
    { name: "s", headers: { Authorization: "t", "X-B": "2" } },
    false,
  );
  assert.deepEqual(headers, {
    name: "s",
    headers: { Authorization: "t", "X-A": "1", "X-B": "2" },
  });
  const models = mergeFields(
    { apiKey: "k", models: [{ id: "x" }] },
    { apiKey: "k", models: [{ id: "x" }, { id: "a" }] },
    { apiKey: "k", models: [{ id: "x" }, { id: "b" }] },
    false,
  ) as { models: Array<{ id: string }> };
  assert.deepEqual(models.models.map((model) => model.id).sort(), [
    "a",
    "b",
    "x",
  ]);
  // A leaf both changed: the newer side's value; a field removed on the
  // older side and edited on the newer one stays.
  assert.deepEqual(
    mergeFields(
      { a: { v: 1 }, b: 1 },
      { a: { v: 2 } },
      { a: { v: 3 }, b: 2 },
      false,
    ),
    { a: { v: 3 }, b: 2 },
  );
  assert.deepEqual(
    mergeFields({ a: { v: 1 } }, { a: { v: 2 } }, { a: { v: 3 } }, true),
    { a: { v: 2 } },
  );
});

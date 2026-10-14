import { syncBackendCapabilities } from "../src/shared/sync-backends";
import assert from "node:assert/strict";
import test from "node:test";
import { loadContent, resetSync } from "../src/background/sync/service";
import { mergePreferences } from "../src/shared/default-preferences";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { runSyncRound } from "../src/shared/sync/engine";
import { decodeRoot } from "../src/shared/sync/root";
import {
  ALL_ON,
  device,
  hookedTransport,
  memoryServer,
  memoryTransport,
  messageIds,
  saveChat,
  type Device,
  type MemoryServer,
} from "./sync-fixtures";

// How people use sync: setting up a new browser, trying another backend,
// clearing data, opening chats while a round waits for the server.

const CHATS = STORAGE_KEYS.chats;
const PREFS = STORAGE_KEYS.preferences;
const PROVIDERS = STORAGE_KEYS.provider;
const AGENTS = STORAGE_KEYS.agents;
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
type Providers = Record<string, { apiKey: string; model?: string }>;

function setup() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, server, a, b };
}

async function deleted(server: MemoryServer, collection: string) {
  const root = await decodeRoot(server.root!);
  return Object.entries(root.records).filter(
    ([id, record]) => id.startsWith(`${collection}/`) && record.deleted,
  ).length;
}

const chatIds = (on: Device) =>
  (on.get<Array<{ id: string }>>(CHATS) ?? []).map((item) => item.id).sort();

test("a new browser where a few settings changed joins an account and keeps the account's settings and keys", async () => {
  const { clock, server, a } = setup();
  await a.set(
    PREFS,
    mergePreferences({
      accentColor: "blue",
      maxToolSteps: 77,
      autoScroll: true,
    }),
  );
  await a.set(PROVIDERS, {
    openai: { apiKey: "sk-account", model: "gpt" },
    local: { apiKey: "local-key", model: "llama" },
  });
  await a.set(AGENTS, [{ id: "g1", name: "Researcher", createdAt: 1 }]);
  await a.sync("edit");
  clock.now += 30 * DAY;
  // A new profile: the user picks dark mode, turns off auto-scroll, opens
  // the OpenAI form (stored with an empty key) and then turns sync on.
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  await b.set(PREFS, mergePreferences({ colorScheme: "dark" }));
  clock.now += 60_000;
  await b.set(
    PREFS,
    mergePreferences({ colorScheme: "dark", autoScroll: false }),
  );
  await b.set(PROVIDERS, { openai: { apiKey: "", model: "gpt" } });
  clock.now += 60_000;
  await b.sync("startup");
  await a.sync();
  for (const on of [a, b]) {
    const prefs = on.get<Record<string, unknown>>(PREFS);
    assert.equal(prefs.colorScheme, "dark", on.name);
    assert.equal(prefs.autoScroll, false, on.name);
    assert.equal(prefs.accentColor, "blue", on.name);
    assert.equal(prefs.maxToolSteps, 77, on.name);
    const providers = on.get<Providers>(PROVIDERS);
    assert.equal(providers.openai.apiKey, "sk-account", on.name);
    assert.equal(providers.local.apiKey, "local-key", on.name);
    assert.equal(on.get<unknown[]>(AGENTS).length, 1, on.name);
  }
});

test("a week on browser sync, then back to WebDAV: the newest edit of each item wins", async () => {
  const { clock, a, b } = setup();
  await a.set(PROVIDERS, {
    p1: { apiKey: "v0" },
    p2: { apiKey: "v0" },
    p3: { apiKey: "v0" },
  });
  await a.set(PREFS, mergePreferences({ accentColor: "green" }));
  await a.sync("edit");
  await b.sync();
  const browserSync = {
    ...b.context,
    scope: "browser-sync",
    transport: {
      ...memoryTransport(memoryServer()),
      capabilities: syncBackendCapabilities("browser-sync"),
    },
  };
  await runSyncRound(browserSync, "startup");
  const providers = () => ({ ...b.get<Providers>(PROVIDERS) });
  clock.now += DAY;
  await b.set(PROVIDERS, { ...providers(), p1: { apiKey: "b-day1" } });
  await runSyncRound(browserSync, "edit");
  clock.now += DAY;
  await b.set(PREFS, mergePreferences({ accentColor: "pink" }));
  await runSyncRound(browserSync, "edit");
  clock.now += DAY;
  await a.set(PROVIDERS, {
    ...a.get<Providers>(PROVIDERS),
    p2: { apiKey: "a-day3" },
  });
  await a.sync("edit");
  clock.now += 2 * DAY;
  await a.set(PROVIDERS, {
    ...a.get<Providers>(PROVIDERS),
    p1: { apiKey: "a-day5" },
  });
  await a.sync("edit");
  clock.now += DAY;
  await b.set(PROVIDERS, { ...providers(), p3: { apiKey: "b-day6" } });
  await runSyncRound(browserSync, "edit");
  clock.now += DAY;
  await b.sync("startup");
  await a.sync();
  for (const on of [a, b]) {
    const stored = on.get<Providers>(PROVIDERS);
    assert.equal(stored.p1.apiKey, "a-day5", on.name);
    assert.equal(stored.p2.apiKey, "a-day3", on.name);
    assert.equal(stored.p3.apiKey, "b-day6", on.name);
    assert.equal(
      on.get<Record<string, unknown>>(PREFS).accentColor,
      "pink",
      on.name,
    );
  }
});

test("two devices with their own chats join: both keep every chat and can open them", async () => {
  const { clock, server, a } = setup();
  for (let i = 0; i < 6; i++) await saveChat(a, `a${i}`, [[`m${i}`, i]]);
  await a.sync("edit");
  clock.now += DAY;
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  for (let i = 0; i < 4; i++) await saveChat(b, `b${i}`, [[`n${i}`, i]]);
  clock.now += 60_000;
  assert.equal((await b.sync("startup")).massDelete, undefined);
  assert.equal((await a.sync()).massDelete, undefined);
  assert.deepEqual(chatIds(a), chatIds(b));
  assert.equal(chatIds(a).length, 10);
  assert.equal(await loadContent(a.context, "chats", "b2"), true);
  assert.deepEqual(messageIds(a, "b2"), ["n2"]);
  assert.equal(await loadContent(b.context, "chats", "a5"), true);
  assert.deepEqual(messageIds(b, "a5"), ["m5"]);
});

test("clearing a few local chats downloads them again and deletes nothing", async () => {
  const { clock, server, a, b } = setup();
  for (const id of ["c1", "c2", "c3"]) await saveChat(a, id, [[id, 1]]);
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await resetSync(b.env, b.context, false, [CHATS]);
  await b.remove(CHATS);
  clock.now += 1000;
  await b.sync("manual");
  await a.sync();
  assert.equal(await deleted(server, "chats"), 0);
  assert.deepEqual(chatIds(a), ["c1", "c2", "c3"]);
  assert.deepEqual(chatIds(b), ["c1", "c2", "c3"]);
});

test("most of a list deleted on this device waits for the user before deleting it everywhere", async () => {
  const { clock, server, a, b } = setup();
  for (let i = 0; i < 8; i++) await saveChat(a, `c${i}`, [[`m${i}`, i]]);
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  // The chat list is gone on b (removed by hand, or by a bug).
  const stored = Object.keys(await b.env.local.get(null));
  for (const key of stored.filter((name) => name.startsWith(CHATS)))
    await b.remove(key);
  const asked = await b.sync("edit");
  assert.deepEqual(asked.massDelete?.[0]?.collection, "chats");
  assert.equal(await deleted(server, "chats"), 0);
  // "Restore on this device": the chats come back.
  await b.sync("manual", {
    massDelete: { collections: ["chats"], keep: true },
  });
  await a.sync();
  assert.equal(await deleted(server, "chats"), 0);
  assert.equal(chatIds(b).length, 8);
  assert.equal(chatIds(a).length, 8);
  // Deleting them again and confirming deletes them everywhere.
  clock.now += 1000;
  await b.set(CHATS, []);
  assert.ok((await b.sync("edit")).massDelete?.length);
  await b.sync("manual", {
    massDelete: { collections: ["chats"], keep: false },
  });
  assert.equal(await deleted(server, "chats"), 8);
  // a holds them all: its own guard asks before applying.
  assert.ok((await a.sync()).massDelete?.length);
});

test("opening a chat does not wait for a round that waits for the server", async () => {
  const { clock, server, a } = setup();
  const hooked = hookedTransport(memoryTransport(server));
  const b = device("deviceB", hooked.transport, clock, ALL_ON);
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  let release!: () => void;
  const answered = new Promise<void>((resolve) => (release = resolve));
  let waiting!: () => void;
  const started = new Promise<void>((resolve) => (waiting = resolve));
  hooked.hooks.readRoot = async () => {
    waiting();
    await answered;
  };
  const round = b.sync("poll");
  await started;
  const opened = await Promise.race([
    loadContent(b.context, "chats", "X"),
    new Promise((resolve) => setTimeout(() => resolve("waited"), 500)),
  ]);
  release();
  await round;
  assert.equal(opened, true);
  assert.deepEqual(messageIds(b, "X"), ["m1"]);
});

test("opening a chat stores its content without counting as an edit", async () => {
  const { server, a, b } = setup();
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  const before = (await decodeRoot(server.root!)).records["chats/X"].clock;
  assert.equal(await loadContent(b.context, "chats", "X"), true);
  await b.settle();
  const result = await b.sync("edit");
  assert.equal(result.pending, 0);
  assert.equal(result.checked, false);
  await b.sync("manual");
  assert.equal(
    (await decodeRoot(server.root!)).records["chats/X"].clock,
    before,
  );
});

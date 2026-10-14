import { syncBackendCapabilities } from "../src/shared/sync-backends";
import assert from "node:assert/strict";
import test from "node:test";
import { loadContent, resetSync } from "../src/background/sync/service";
import { mergePreferences } from "../src/shared/default-preferences";
import {
  mergeSyncGroupSettings,
  STORAGE_KEYS,
} from "../src/shared/storage-keys";
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
  testEnv,
  type Device,
  type MemoryServer,
} from "./sync-fixtures";

// The second review's repros (N1–N5, variants of F1, F9 and the killed
// worker), kept as tests. Each asserts the correct behaviour.

const CHATS = STORAGE_KEYS.chats;
const PREFS = STORAGE_KEYS.preferences;
const SYNC_DATA = STORAGE_KEYS.syncGroups;
const PROVIDERS = STORAGE_KEYS.provider;
const HOUR = 60 * 60_000;
type Providers = Record<string, { apiKey: string }>;

function setup() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, server, a, b };
}

// Another backend for one device (browser sync: no chats there).
function elsewhere(on: Device, server = memoryServer()) {
  return {
    ...on.context,
    scope: "browser-sync",
    transport: {
      ...memoryTransport(server),
      capabilities: syncBackendCapabilities("browser-sync"),
    },
  };
}

async function deletedChats(server: MemoryServer) {
  const root = await decodeRoot(server.root!);
  return Object.entries(root.records).filter(
    ([id, record]) => id.startsWith("chats/") && record.deleted,
  ).length;
}

const key = (on: Device, id = "p1") => on.get<Providers>(PROVIDERS)[id]?.apiKey;

test("review N1: joining with one changed preference keeps the account's others", async () => {
  const { clock, server, a } = setup();
  await a.set(
    PREFS,
    mergePreferences({
      accentColor: "blue",
      maxToolSteps: 77,
      helperModelId: "cheap-model",
    }),
  );
  await a.sync("edit");
  clock.now += 72 * HOUR;
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  await b.set(PREFS, mergePreferences({ colorScheme: "dark" }));
  clock.now += 60_000;
  await b.sync("startup");
  await a.sync();
  for (const on of [a, b]) {
    const prefs = on.get<Record<string, unknown>>(PREFS);
    assert.equal(prefs.colorScheme, "dark", on.name);
    assert.equal(prefs.accentColor, "blue", on.name);
    assert.equal(prefs.maxToolSteps, 77, on.name);
    assert.equal(prefs.helperModelId, "cheap-model", on.name);
  }
});

test("review N1b: joining with one sync category toggled keeps the account's categories", async () => {
  const { clock, server, a } = setup();
  await a.set(SYNC_DATA, mergeSyncGroupSettings({ ...ALL_ON }));
  await a.sync("edit");
  clock.now += 72 * HOUR;
  const b = device("deviceB", memoryTransport(server), clock);
  await b.set(SYNC_DATA, mergeSyncGroupSettings({ syncFiles: false }));
  clock.now += 60_000;
  await b.sync("startup");
  await a.sync();
  const onA = a.get<Record<string, boolean>>(SYNC_DATA);
  assert.equal(onA.syncKeys, true);
  assert.equal(onA.syncChats, true);
  assert.equal(onA.syncFiles, false);
});

test("review N1c: a provider stored empty on a new device keeps the account's API key", async () => {
  const { clock, server, a } = setup();
  await a.set(PROVIDERS, { openai: { apiKey: "sk-real", model: "gpt" } });
  await a.sync("edit");
  clock.now += 72 * HOUR;
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  await b.set(PROVIDERS, { openai: { apiKey: "", model: "gpt" } });
  clock.now += 60_000;
  await b.set(PROVIDERS, {
    openai: { apiKey: "", model: "gpt" },
    other: { apiKey: "k2", model: "m" },
  });
  await b.sync("startup");
  await a.sync();
  for (const on of [a, b]) {
    assert.equal(key(on, "openai"), "sk-real", on.name);
    assert.equal(key(on, "other"), "k2", on.name);
  }
});

test("review N1d: a second device's own chats and the account's are both kept", async () => {
  const { clock, server, a } = setup();
  for (let i = 0; i < 10; i++) await saveChat(a, `a${i}`, [[`m${i}`, i]]);
  await a.sync("edit");
  clock.now += 72 * HOUR;
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  for (let i = 0; i < 3; i++) await saveChat(b, `b${i}`, [[`n${i}`, i]]);
  clock.now += 60_000;
  const result = await b.sync("startup");
  await a.sync();
  assert.equal(result.massDelete, undefined);
  assert.equal(a.get<unknown[]>(CHATS).length, 13);
  assert.equal(b.get<unknown[]>(CHATS).length, 13);
});

test("review N2/S1: clearing local chats under another backend deletes nothing in the WebDAV account", async () => {
  const { clock, server, a, b } = setup();
  for (let i = 0; i < 8; i++) await saveChat(a, `c${i}`, [[`m${i}`, i]]);
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  const browserSync = elsewhere(b);
  await runSyncRound(browserSync, "startup");
  await resetSync(b.env, browserSync, false, [CHATS, STORAGE_KEYS.chatTabs]);
  await b.remove(CHATS);
  clock.now += 60_000;
  await b.sync("startup");
  await a.sync();
  assert.equal(await deletedChats(server), 0);
  assert.equal(a.get<unknown[]>(CHATS).length, 8);
  assert.equal(b.get<unknown[]>(CHATS).length, 8);
});

test("review N2/S1b: clearing local chats with sync off deletes nothing when sync comes back", async () => {
  const { clock, server, a, b } = setup();
  for (let i = 0; i < 8; i++) await saveChat(a, `c${i}`, [[`m${i}`, i]]);
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  // The debug page clears through the background, sync on or off.
  await resetSync(b.env, undefined, false, [CHATS, STORAGE_KEYS.chatTabs]);
  await b.remove(CHATS);
  clock.now += 60_000;
  await b.sync("startup");
  await a.sync();
  assert.equal(await deletedChats(server), 0);
  assert.equal(a.get<unknown[]>(CHATS).length, 8);
  assert.equal(b.get<unknown[]>(CHATS).length, 8);
});

test("review N4/W1: trying browser sync and switching back pushes no old values to WebDAV", async () => {
  const { clock, a, b } = setup();
  const browserServer = memoryServer();
  const c = device(
    "deviceC",
    {
      ...memoryTransport(browserServer),
      capabilities: syncBackendCapabilities("browser-sync"),
    },
    clock,
    ALL_ON,
  );
  await c.set(PROVIDERS, { p1: { apiKey: "old-key-from-months-ago" } });
  await c.sync("edit");
  clock.now += 90 * 24 * HOUR;
  await a.set(PROVIDERS, { p1: { apiKey: "current-key" } });
  await a.sync("edit");
  await b.sync();
  clock.now += HOUR;
  await runSyncRound(elsewhere(b, browserServer), "startup");
  clock.now += HOUR;
  await b.sync("startup");
  await a.sync();
  assert.equal(key(a), "current-key");
  assert.equal(key(b), "current-key");
});

test("review N4/W2: an edit made under another backend does not beat a later WebDAV edit", async () => {
  const { clock, a, b } = setup();
  const browserSync = elsewhere(b);
  await a.set(PROVIDERS, { p1: { apiKey: "v0" } });
  await a.sync("edit");
  await b.sync();
  await runSyncRound(browserSync, "startup");
  clock.now += HOUR;
  await b.set(PROVIDERS, { p1: { apiKey: "b-day1-on-browser-sync" } });
  await runSyncRound(browserSync, "edit");
  clock.now += 48 * HOUR;
  await a.set(PROVIDERS, { p1: { apiKey: "a-day3-latest" } });
  await a.sync("edit");
  clock.now += 48 * HOUR;
  await b.sync("startup");
  await a.sync();
  assert.equal(key(a), "a-day3-latest");
  assert.equal(key(b), "a-day3-latest");
});

test("review N5/F9v: an old edit is not stamped with a later edit of another record in its key", async () => {
  const { clock, a, b } = setup();
  await a.set(PROVIDERS, { p1: { apiKey: "v0" }, p2: { apiKey: "w0" } });
  await a.sync("edit");
  await b.sync();
  await b.set(PROVIDERS, { p1: { apiKey: "b-day1" }, p2: { apiKey: "w0" } });
  clock.now += 48 * HOUR;
  await a.set(PROVIDERS, { p1: { apiKey: "a-day3" }, p2: { apiKey: "w0" } });
  await a.sync("edit");
  clock.now += 72 * HOUR;
  await b.set(PROVIDERS, {
    p1: { apiKey: "b-day1" },
    p2: { apiKey: "b-day6" },
  });
  await b.sync("startup");
  await a.sync();
  for (const on of [a, b]) {
    assert.equal(key(on, "p1"), "a-day3", on.name);
    assert.equal(key(on, "p2"), "b-day6", on.name);
  }
});

test("review F1v: a chat another device keeps changing still opens", async () => {
  const { clock, server, a } = setup();
  const hooked = hookedTransport(memoryTransport(server));
  const b = device("deviceB", hooked.transport, clock, ALL_ON);
  const messages: Array<[string, number]> = [["m1", 1]];
  await saveChat(a, "X", messages);
  await a.sync("edit");
  await b.sync();
  let overtaken = 0;
  const overtake = async () => {
    clock.now += 1000;
    messages.push([`a${++overtaken}`, overtaken + 1]);
    await saveChat(a, "X", messages);
    await a.sync("edit");
    await b.sync("poll");
    if (overtaken < 3) hooked.hooks.getBlob = overtake;
  };
  hooked.hooks.getBlob = overtake;
  assert.equal(await loadContent(b.context, "chats", "X"), true);
  assert.deepEqual(messageIds(b, "X"), ["m1", "a1", "a2", "a3"]);
});

// The background is stopped in the middle of a round (5-minute limit,
// browser exit, update): no `finally` runs, its locks are released.
test("review E1: a round killed after applying changes sends none of them back", async () => {
  const { clock, server, a } = setup();
  const hooked = hookedTransport(memoryTransport(server));
  const b = device("deviceB", hooked.transport, clock, ALL_ON);
  await a.set(PROVIDERS, { p1: { apiKey: "v0" } });
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await a.set(PROVIDERS, { p1: { apiKey: "a1" } });
  await a.sync("edit");
  clock.now += 1000;
  await b.set(STORAGE_KEYS.language, "de-DE");
  let killed!: () => void;
  const reached = new Promise<void>((resolve) => (killed = resolve));
  hooked.hooks.writeRoot = () => {
    killed();
    return new Promise<void>(() => undefined);
  };
  void b.sync("edit");
  await reached;
  assert.equal(key(b), "a1");
  b.env.lock = testEnv(clock).lock;
  clock.now += 1000;
  await a.set(PROVIDERS, { p1: { apiKey: "a2" } });
  await a.sync("edit");
  clock.now += 1000;
  await b.sync("startup");
  await a.sync();
  assert.equal(key(a), "a2");
  assert.equal(key(b), "a2");
  assert.equal(a.get(STORAGE_KEYS.language), "de-DE");
});

import assert from "node:assert/strict";
import test from "node:test";
import { loadContent, resetSync } from "../src/background/sync/service";
import { storageLockName } from "../src/shared/locks";
import { mergePreferences } from "../src/shared/default-preferences";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { runSyncRound } from "../src/shared/sync/engine";
import {
  ALL_ON,
  device,
  memoryServer,
  memoryTransport,
  messageIds,
  saveChat,
  type Device,
} from "./sync-fixtures";

// The third review's repros (U1, P1, M1), kept as tests. Each asserts the
// correct behaviour.

const CHATS = STORAGE_KEYS.chats;
const PREFS = STORAGE_KEYS.preferences;
const PROVIDERS = STORAGE_KEYS.provider;
const HOUR = 60 * 60_000;
type Providers = Record<string, { apiKey: string; model: string }>;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// storage.onChanged reaches the listener `ms` after the write resolves.
function delayListener(on: Device, ms: number) {
  const original = on.env.local.listeners[0];
  on.env.local.listeners[0] = (changes) =>
    void setTimeout(() => original(changes), ms);
}

async function joinWithLateEvent(
  key: string,
  account: unknown,
  edited: unknown,
  delayed: boolean,
) {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  await a.set(key, account);
  await a.sync("edit");
  clock.now += HOUR;
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  if (delayed) delayListener(b, 20);
  // The user edits on b as b's first round starts.
  await b.env.local.set({ [key]: edited });
  if (!delayed) await b.settle();
  await runSyncRound(b.context, "startup");
  await wait(60);
  clock.now += 60_000;
  await b.sync("manual");
  await wait(60);
  await a.sync("manual");
  return [a, b];
}

for (const delayed of [true, false]) {
  const when = delayed ? "after" : "before";
  test(`review3 U1: a first edit whose event arrives ${when} the round's read survives`, async () => {
    const devices = await joinWithLateEvent(
      PREFS,
      mergePreferences({ accentColor: "blue" }),
      mergePreferences({ accentColor: "green" }),
      delayed,
    );
    assert.deepEqual(
      devices.map((on) => on.get<Record<string, unknown>>(PREFS).accentColor),
      ["green", "green"],
    );
  });

  test(`review3 U1b: a new API key whose event arrives ${when} the round's read survives`, async () => {
    const devices = await joinWithLateEvent(
      PROVIDERS,
      { openai: { apiKey: "sk-old", model: "gpt" } },
      { openai: { apiKey: "sk-new-rotated", model: "gpt" } },
      delayed,
    );
    assert.deepEqual(
      devices.map((on) => on.get<Providers>(PROVIDERS).openai.apiKey),
      ["sk-new-rotated", "sk-new-rotated"],
    );
  });
}

function ignoringServer() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const options = { ignoreIfMatch: true };
  const a = device("deviceA", memoryTransport(server, options), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server, options), clock, ALL_ON);
  return { clock, server, a, b };
}

// a writes its change; b, which read the root before, replaces it.
async function overwrite(
  { clock, server, a, b }: ReturnType<typeof ignoringServer>,
  changeA: () => Promise<unknown>,
  changeB: () => Promise<unknown>,
) {
  const before = { root: server.root, etag: server.etag };
  clock.now += 1000;
  await changeA();
  await a.sync("edit");
  server.root = before.root;
  server.etag = before.etag;
  clock.now += 1000;
  await changeB();
  await b.sync("edit");
  for (let i = 0; i < 3; i++) {
    clock.now += 60_000;
    await a.sync();
    await b.sync();
  }
}

test("review3 P1: one chat changed on two devices, server ignores If-Match", async () => {
  const setup = ignoringServer();
  const { a, b } = setup;
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  assert.equal(await loadContent(b.context, "chats", "X"), true);
  await b.settle();
  await overwrite(
    setup,
    () =>
      saveChat(a, "X", [
        ["m1", 1],
        ["a1", 2],
      ]),
    () =>
      saveChat(b, "X", [
        ["m1", 1],
        ["b1", 3],
      ]),
  );
  for (const on of [a, b])
    assert.deepEqual(messageIds(on, "X"), ["m1", "a1", "b1"], on.name);
});

test("review3 P1b: two fields of one provider, server ignores If-Match", async () => {
  const setup = ignoringServer();
  const { a, b } = setup;
  await a.set(PROVIDERS, { p: { apiKey: "k0", model: "m0" } });
  await a.sync("edit");
  await b.sync();
  await overwrite(
    setup,
    () => a.set(PROVIDERS, { p: { apiKey: "k-a", model: "m0" } }),
    () => b.set(PROVIDERS, { p: { apiKey: "k0", model: "m-b" } }),
  );
  for (const on of [a, b])
    assert.deepEqual(
      on.get<Providers>(PROVIDERS).p,
      { apiKey: "k-a", model: "m-b" },
      on.name,
    );
});

test("review3 M1: a chat body change the listener missed is merged, not stalled", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  assert.equal(await loadContent(b.context, "chats", "X"), true);
  await b.settle();
  clock.now += 1000;
  // b's last write before the browser closed: content only, no event.
  const content = b.get<{ messages: unknown[] }>(`${CHATS}/X`);
  b.seed(`${CHATS}/X`, {
    messages: [
      ...content.messages,
      { id: "b1", role: "user", content: "b1", createdAt: 2 },
    ],
  });
  clock.now += 60_000;
  await saveChat(a, "X", [
    ["m1", 1],
    ["a1", 3],
  ]);
  await a.sync("edit");
  clock.now += 60_000;
  // The stalled chat is reported as waiting.
  const first = await b.sync("poll");
  assert.ok(first.pending > 0, "the missed change is reported");
  for (let i = 0; i < 3; i++) {
    clock.now += 60_000;
    await b.sync("poll");
    await a.sync("poll");
  }
  for (const on of [a, b])
    assert.deepEqual(messageIds(on, "X"), ["m1", "b1", "a1"], on.name);
});

test("review3 P1 control: a message deleted on another device right after it was sent stays deleted", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  assert.equal(await loadContent(b.context, "chats", "X"), true);
  await b.settle();
  clock.now += 1000;
  // a sends a1; before a reads the root again, b removes it.
  await saveChat(a, "X", [
    ["m1", 1],
    ["a1", 2],
  ]);
  await a.sync("edit");
  clock.now += 1000;
  await b.sync();
  await saveChat(b, "X", [["m1", 1]]);
  await b.sync("edit");
  for (let i = 0; i < 2; i++) {
    clock.now += 60_000;
    await a.sync();
    await b.sync();
  }
  for (const on of [a, b])
    assert.deepEqual(messageIds(on, "X"), ["m1"], on.name);
});

test("review3 S1: an app update that read the chat list before a local clear brings nothing back", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  await saveChat(a, "X", [["m1", 1]]);
  await saveChat(a, "Y", [["m2", 2]]);
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await a.set(
    CHATS,
    a.get<Array<{ id: string }>>(CHATS).filter((chat) => chat.id !== "Y"),
  );
  await a.sync("edit");
  clock.now += 1000;
  // The side panel updates the list (read, then write) while b's chats
  // are cleared.
  let cleared: Promise<unknown> | undefined;
  await b.env.lock(storageLockName(CHATS), async () => {
    const list = (await b.env.local.get(CHATS))[CHATS] as Array<{ id: string }>;
    cleared = resetSync(b.env, b.context, false, [CHATS]);
    await wait(10);
    await b.env.local.set({ [CHATS]: list.map((chat) => ({ ...chat })) });
  });
  await cleared;
  await b.settle();
  for (let i = 0; i < 2; i++) {
    clock.now += 60_000;
    await b.sync();
    await a.sync();
  }
  for (const on of [a, b])
    assert.deepEqual(
      on.get<Array<{ id: string }>>(CHATS).map((chat) => chat.id),
      ["X"],
      on.name,
    );
});

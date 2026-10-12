import assert from "node:assert/strict";
import test from "node:test";
import { loadContent, resetSync } from "../src/background/sync/service";
import { storageLockName } from "../src/shared/locks";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import {
  ALL_ON,
  chat,
  device,
  hookedTransport,
  memoryServer,
  memoryTransport,
  messageIds,
  saveChat,
} from "./sync-fixtures";

// Jobs that overlap on one device (a round, opening a chat, clearing data,
// the app saving) and rounds that overlap across devices.

const CHATS = STORAGE_KEYS.chats;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setup() {
  const clock = { now: 1_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const hooked = hookedTransport(memoryTransport(server));
  const b = device("deviceB", hooked.transport, clock, ALL_ON);
  return { clock, server, a, b, hooks: hooked.hooks };
}

test("opening a chat while a round updates it stores the chat's current content", async () => {
  const { clock, a, b, hooks } = setup();
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await saveChat(a, "X", [
    ["m1", 1],
    ["a2", 2],
  ]);
  await a.sync("edit");
  // The side panel opens (an "open" round) as the user clicks the chat: the
  // round runs while the chat's content downloads.
  hooks.getBlob = async () => void (await b.sync("open"));
  assert.equal(await loadContent(b.context, "chats", "X"), true);
  assert.deepEqual(messageIds(b, "X"), ["m1", "a2"]);
  // The background sees the stored content as a change.
  await b.set(`${CHATS}/X`, b.get(`${CHATS}/X`));
  clock.now += 1000;
  await b.sync("edit");
  await a.sync();
  assert.deepEqual(messageIds(a, "X"), ["m1", "a2"]);
  assert.deepEqual(messageIds(b, "X"), ["m1", "a2"]);
});

test("clearing local chats while a round runs downloads them again and deletes nothing", async () => {
  const { clock, a, b, hooks } = setup();
  for (const id of ["c1", "c2", "c3"]) await saveChat(b, id, [[id, 1]]);
  await b.sync("edit");
  await a.sync();
  clock.now += 1000;
  // The user clears local chats (debug page) while a poll round runs.
  let reset: Promise<void> | undefined;
  hooks.readRoot = async () => {
    reset = resetSync(b.env, b.context, false, [CHATS]);
    await Promise.race([reset, sleep(20)]);
  };
  await b.sync("poll");
  await reset;
  // The background sees the removed keys as changes.
  await b.remove(CHATS);
  for (const reason of ["manual", "edit"] as const) {
    clock.now += 1000;
    await b.sync(reason);
  }
  await a.sync();
  assert.deepEqual(
    a.get<Array<{ id: string }>>(CHATS).map((chat) => chat.id),
    ["c1", "c2", "c3"],
  );
  assert.equal(b.get<unknown[]>(CHATS)?.length, 3);
});

test("a chat saved by the app while the engine writes that chat is not overwritten", async () => {
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
  // The app saves the chat (under the lock of its content key) while b's
  // engine is between checking the chat and writing it.
  const set = b.env.local.set.bind(b.env.local);
  const mine = chat("X", [
    ["m1", 1],
    ["b3", 3],
  ]);
  let appSave: Promise<void> | undefined;
  b.env.local.set = async (items) => {
    if (!appSave && `${CHATS}/X` in items) {
      appSave = b.env.lock(storageLockName(`${CHATS}/X`), () =>
        set({ [`${CHATS}/X`]: mine.content }),
      );
      await Promise.race([appSave, sleep(20)]);
    }
    return set(items);
  };
  await b.sync();
  b.env.local.set = set;
  await appSave;
  assert.deepEqual(messageIds(b, "X"), ["m1", "b3"]);
  await b.set(CHATS, [mine.summary]);
  await b.set(`${CHATS}/X`, mine.content);
  clock.now += 1000;
  await b.sync("edit");
  await a.sync();
  assert.ok(messageIds(a, "X").includes("b3"));
});

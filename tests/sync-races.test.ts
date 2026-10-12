import assert from "node:assert/strict";
import test from "node:test";
import { loadContent } from "../src/background/sync/service";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import {
  ALL_ON,
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

import assert from "node:assert/strict";
import test from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { type ChatContent, type ChatSummary } from "../src/shared/types";
import {
  openChatContent,
  reattachToRun,
  reply,
  storeChat,
  userMessage,
} from "./sync-app-fixture";
import {
  ALL_ON,
  device,
  memoryServer,
  memoryTransport,
  messageIds,
} from "./sync-fixtures";

// Background rewrites of chats (the seventh fix): app paths that store a
// chat although the user changed nothing in it. Sync counts such a write as
// an edit made here, so a message deleted on another device comes back
// (an edit wins over a delete) or an older copy replaces a newer one.

const CHATS = STORAGE_KEYS.chats;

function pair() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, a, b };
}

const listed = (on: ReturnType<typeof device>) =>
  (on.get<ChatSummary[]>(CHATS) ?? []).map((chat) => chat.id);
const contentOf = (on: ReturnType<typeof device>, id: string) =>
  on.get<ChatContent>(`${CHATS}/${id}`);
// Longer than the 15 minutes after which a running chat used to upload.
const LONG_RUN_MS = 16 * 60_000;
// A run that started this long ago, its list entry untouched since.
const startedAgo = (ms: number) => ({ updatedAt: Date.now() - ms });

test("fix7 P1: opening a chat whose run died stores nothing, so the reply deleted elsewhere stays deleted", async () => {
  const { clock, a, b } = pair();
  // A's run died (the browser closed mid-reply) a while ago.
  await storeChat(
    a,
    "X",
    { messages: [userMessage("u1", 1), reply("a1", 2, "Hel")] },
    startedAgo(LONG_RUN_MS),
  );
  await a.sync("edit");
  await b.sync();
  assert.deepEqual(messageIds(b, "X"), []);
  assert.deepEqual((await openChatContent(b, "X"))?.messages.length, 2);
  // On A the user sends the message again: the dead reply is replaced.
  clock.now += 60_000;
  await storeChat(a, "X", {
    messages: [userMessage("u1", 1), reply("a2", 3, "Hello", 4)],
  });
  await a.sync("edit");
  // B opens the chat before its next sync: the panel reattaches to the run.
  clock.now += 60_000;
  const stopped = await reattachToRun(b, "X", "a1");
  await b.sync();
  await a.sync();
  for (const on of [a, b])
    assert.deepEqual(messageIds(on, "X"), ["u1", "a2"], on.name);
  assert.deepEqual(stopped, ["a1"], "the panel knows the run is over");
});

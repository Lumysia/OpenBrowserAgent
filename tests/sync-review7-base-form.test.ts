import assert from "node:assert/strict";
import test from "node:test";
import {
  readLocalChatContent,
  saveChatContent,
} from "../src/shared/chat-storage";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import type { ChatContent } from "../src/shared/types";
import { onDevice, userMessage } from "./sync-app-fixture";
import { device, memoryServer, memoryTransport, ALL_ON } from "./sync-fixtures";

const KEY = `${STORAGE_KEYS.chats}/X`;

// A reply whose stored form is not its normalized form: a reasoning part
// that started and got no text (stream-parts creates `text: ""`).
const r1 = {
  id: "r1",
  role: "assistant" as const,
  content: "answer",
  createdAt: 2,
  parts: [{ id: "p1", type: "reasoning" as const, text: "" }],
};

test("review7 S1: a save racing a download keeps the download (the base a save returns is the read form)", async () => {
  const clock = { now: 1_000_000_000 };
  const b = device("deviceB", memoryTransport(memoryServer()), clock, ALL_ON);
  // Stored as it streamed (raw form).
  b.seed(KEY, { messages: [userMessage("u1", 1), r1] });
  await onDevice(b, async () => {
    // The panel loads the chat (normalized), then the user adds u2.
    const loaded = (await readLocalChatContent("X"))!;
    const page1: ChatContent = {
      messages: [...loaded.messages, userMessage("u2", 3)],
    };
    const saved = await saveChatContent("X", page1, loaded);
    const base = saved.content; // what chat-content-store keeps as base
    // A download (another device regenerated r1 -> r1b) is stored...
    await b.env.local.set({
      [KEY]: {
        messages: [
          userMessage("u1", 1),
          { ...r1, id: "r1b", content: "regen", parts: [] },
          userMessage("u2", 3),
        ],
      },
    });
    // ...and the page saves its next edit before it has applied it.
    const page2: ChatContent = {
      messages: [...page1.messages, userMessage("u3", 4)],
    };
    await saveChatContent("X", page2, base);
  });
  const ids = b.get<ChatContent>(KEY).messages.map((m) => m.id);
  assert.deepEqual(ids, ["u1", "r1b", "u2", "u3"]);
});

test("review7 S1: a save returns the content as reading it gives it", async () => {
  const b = device(
    "deviceB",
    memoryTransport(memoryServer()),
    { now: 1 },
    ALL_ON,
  );
  b.seed(KEY, { messages: [userMessage("u1", 1), r1] });
  await onDevice(b, async () => {
    const loaded = (await readLocalChatContent("X"))!;
    const page: ChatContent = {
      messages: [...loaded.messages, userMessage("u2", 3)],
    };
    const saved = await saveChatContent("X", page, loaded);
    assert.deepEqual(saved.content, await readLocalChatContent("X"));
  });
  // The stored form of the message the save left alone is kept.
  assert.deepEqual(b.get<ChatContent>(KEY).messages[1], r1);
});

test("review7 S1: a save given the stored form as its base still keeps a download", async () => {
  const b = device(
    "deviceB",
    memoryTransport(memoryServer()),
    { now: 1 },
    ALL_ON,
  );
  const raw = { messages: [userMessage("u1", 1), r1] };
  b.seed(KEY, raw);
  await onDevice(b, async () => {
    const loaded = (await readLocalChatContent("X"))!;
    await b.env.local.set({
      [KEY]: {
        messages: [userMessage("u1", 1), { ...r1, id: "r1b", parts: [] }],
      },
    });
    await saveChatContent(
      "X",
      { messages: [...loaded.messages, userMessage("u2", 3)] },
      raw as ChatContent,
    );
  });
  assert.deepEqual(
    b.get<ChatContent>(KEY).messages.map((m) => m.id),
    ["u1", "r1b", "u2"],
  );
});

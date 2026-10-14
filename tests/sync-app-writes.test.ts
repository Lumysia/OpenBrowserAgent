import assert from "node:assert/strict";
import test from "node:test";
import { loadContent } from "../src/background/sync/service";
import { saveChatContent } from "../src/shared/chat-storage";
import { mergePreferences } from "../src/shared/default-preferences";
import { storageLockName } from "../src/shared/locks";
import { rebaseEdit, storeEdit } from "../src/shared/rebase";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import type { ChatContent } from "../src/shared/types";
import {
  ALL_ON,
  chat,
  device,
  memoryServer,
  memoryTransport,
  messageIds,
  saveChat,
  type Device,
} from "./sync-fixtures";
import { swapChrome } from "./fake-chrome";

// Pages save from their in-memory copy. A save that lands after a sync
// download the page has not shown yet must not undo it (third review,
// speculative 2).

const PREFS = STORAGE_KEYS.preferences;
const CHATS = STORAGE_KEYS.chats;
type Prefs = Record<string, unknown>;

// A storage item over a test device, as storage.ts builds it.
function itemOf<T>(on: Device, key: string) {
  const lock = <R>(run: () => Promise<R>) =>
    on.env.lock(storageLockName(key), run);
  const set = (value: T) => on.env.local.set({ [key]: value });
  return {
    set: (value: T) => lock(() => set(value)),
    update: (updater: (current: T) => T) =>
      lock(async () => {
        const current = (await on.env.local.get(key))[key] as T;
        const next = updater(current);
        if (next !== current) await set(next);
        return next;
      }),
  };
}

function pair() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, a, b };
}

test("an edit keeps fields and list items changed elsewhere since the page read them", () => {
  assert.deepEqual(
    rebaseEdit(
      { accentColor: "pink", autoScroll: true },
      { accentColor: "pink", autoScroll: false },
      { accentColor: "blue", autoScroll: true },
    ),
    { accentColor: "blue", autoScroll: false },
  );
  const base = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ];
  assert.deepEqual(
    rebaseEdit(
      base,
      [{ id: "a", name: "A2" }],
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ],
    ),
    [
      { id: "a", name: "A2" },
      { id: "c", name: "C" },
    ],
  );
  // Removed elsewhere, edited here: the edit stays.
  assert.deepEqual(
    rebaseEdit(base, [base[0], { id: "b", name: "B2" }], [base[0]]),
    [base[0], { id: "b", name: "B2" }],
  );
  // Nothing changed elsewhere: the edit as made.
  const edited = { x: [1, 2] };
  assert.equal(rebaseEdit({ x: [1] }, edited, { x: [1] }), edited);
});

test("a settings save from a page that missed a sync download keeps the download", async () => {
  const { clock, a, b } = pair();
  await a.set(PREFS, mergePreferences({}));
  await a.sync("edit");
  await b.sync();
  // b's settings page has loaded the settings.
  const shown = b.get<Prefs>(PREFS);
  clock.now += 1000;
  await a.set(PREFS, mergePreferences({ accentColor: "blue" }));
  await a.sync("edit");
  clock.now += 1000;
  await b.sync();
  // Before the page sees the download, the user turns off auto-scroll.
  await storeEdit(itemOf<Prefs>(b, PREFS), shown, {
    ...shown,
    autoScroll: false,
  });
  await b.settle();
  clock.now += 1000;
  await b.sync("edit");
  await a.sync();
  for (const on of [a, b]) {
    const prefs = on.get<Prefs>(PREFS);
    assert.deepEqual(
      [prefs.accentColor, prefs.autoScroll],
      ["blue", false],
      on.name,
    );
  }
});

test("a chat save from a side panel that missed a sync download keeps the download", async (t) => {
  const { clock, a, b } = pair();
  await saveChat(a, "X", [["m1", 1]]);
  await a.sync("edit");
  await b.sync();
  assert.equal(await loadContent(b.context, "chats", "X"), true);
  await b.settle();
  // b's side panel has the chat open.
  const shown = b.get<ChatContent>(`${CHATS}/X`);
  clock.now += 1000;
  await saveChat(a, "X", [
    ["m1", 1],
    ["a1", 2],
  ]);
  await a.sync("edit");
  clock.now += 1000;
  await b.sync();
  assert.deepEqual(messageIds(b, "X"), ["m1", "a1"]);
  // The side panel saves its copy with the user's new message.
  t.after(swapChrome({ storage: { local: b.env.local } }));
  const edited = chat("X", [
    ["m1", 1],
    ["b1", 3],
  ]).content as unknown as ChatContent;
  await saveChatContent("X", edited, shown);
  await b.settle();
  clock.now += 1000;
  await b.sync("edit");
  await a.sync();
  for (const on of [a, b])
    assert.deepEqual(messageIds(on, "X"), ["m1", "a1", "b1"], on.name);
});

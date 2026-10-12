import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { browserStorage, installBrowser } from "./helpers";
import * as backendImpl from "../src/shared/sync-backends-impl";
import {
  BROWSER_SYNC_BACKEND_ID,
  NO_SYNC_BACKEND_ID,
  registerSyncBackendImpl,
} from "../src/shared/sync-backends";
import {
  storage,
  setDataSync,
  setActiveSyncBackend,
  flushPendingSyncWrites,
  clearPendingSyncWrites,
  STORAGE_KEYS,
  SYNC_PREFERENCES,
} from "../src/shared/storage";
import {
  refreshSyncDataFromRemote,
  refreshSyncSettingsFromRemote,
} from "../src/shared/storage-sync";
import {
  deleteChats,
  loadChatContent,
  readLocalChatContent,
  refreshChatContent,
  saveChatContent,
} from "../src/shared/chat-storage";
import { withChatFacts } from "../src/shared/chats";
import { DEFAULT_SYNC_DATA_SETTINGS } from "../src/shared/storage-keys";
import type { Chat, ChatContent } from "../src/shared/types";

afterEach(async () => {
  await clearPendingSyncWrites();
  mock.restoreAll();
  registerSyncBackendImpl(backendImpl);
});

const browserSync = () =>
  backendImpl.createSyncBackend({
    id: BROWSER_SYNC_BACKEND_ID,
    type: "browser-sync",
    name: "Browser Sync",
  });
const ids = (value: unknown) =>
  (Array.isArray(value) ? value.map((item: { id: string }) => item.id) : [])
    .slice()
    .sort();
const refresh = async () => {
  await refreshSyncSettingsFromRemote();
  await refreshSyncDataFromRemote();
};
const messages = (...texts: string[]) =>
  texts.map((text) => ({
    id: text,
    role: "user" as const,
    content: text,
    createdAt: 1,
  }));
const chat = (id: string, ...texts: string[]): Chat => ({
  id,
  title: id,
  createdAt: 1,
  updatedAt: 1,
  messages: messages(...texts),
});
const texts = (content: ChatContent | undefined) =>
  content?.messages.map((message) => message.content);
// What a device without any local copy gets from the cloud.
async function cloudTexts(id: string) {
  const self = globalThis.chrome;
  installBrowser(undefined, { area: self.storage.sync } as never);
  try {
    const read = await browserSync().readItem(STORAGE_KEYS.chats, id, false);
    return texts(read.value as ChatContent | undefined);
  } finally {
    Object.assign(globalThis, { chrome: self });
  }
}

// A device with chat sync on, sharing `sync` (the browser-sync area) with
// the other devices of the test.
async function chatDevice(sync = browserStorage()) {
  const browser = installBrowser(undefined, sync);
  browser.local.data[STORAGE_KEYS.syncDataSettings] = {
    ...DEFAULT_SYNC_DATA_SETTINGS,
    syncChats: true,
  };
  await setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
  return browser;
}

// Store a chat the way the side panel does: its content, then its list entry.
async function saveChat(value: Chat) {
  const { facts } = await saveChatContent(value.id, value);
  const summary = withChatFacts(value, facts);
  await storage.chats.update((chats) => [
    ...chats.filter((item) => item.id !== value.id),
    summary,
  ]);
}

test("synced chats arrive as a list; a chat's content loads when opened", async () => {
  const first = await chatDevice();
  const { sync } = first;
  await saveChat(chat("one", "hello"));
  await saveChat(chat("two", "world"));
  await flushPendingSyncWrites();

  const other = await chatDevice(sync);
  assert.deepEqual(ids(await storage.chats.get()), ["one", "two"]);
  assert.equal((await storage.chats.get())[0].messageCount, 1);
  const contents = () =>
    Object.keys(other.local.data).filter((key) => key.startsWith("chats/"));
  assert.deepEqual(contents(), [], "no content before a chat is opened");
  assert.deepEqual(texts(await loadChatContent("one")), ["hello"]);
  assert.deepEqual(contents(), ["chats/one"]);

  // An edit uploads that chat's content and the list, nothing else.
  sync.writes.length = 0;
  await saveChat({ ...chat("one", "hello again"), updatedAt: 2 });
  await flushPendingSyncWrites();
  assert.deepEqual(
    sync.writes
      .map((write) => write.keys)
      .flat()
      .sort(),
    ["chats", "chats/one"],
  );
  assert.deepEqual(contents(), ["chats/one"], "two was never downloaded");

  // Deleting a chat removes its content here and in the cloud, and from
  // the first device once it refreshes.
  await deleteChats(["one"]);
  await flushPendingSyncWrites();
  assert.deepEqual(contents(), []);
  assert.equal(sync.data["chats/one"], undefined);
  installBrowser(first.local, sync);
  await refresh();
  assert.equal(first.local.data["chats/one"], undefined);
});

test("a check for newer content racing a local edit keeps both edits", async () => {
  const a = await chatDevice();
  await saveChat(chat("one", "m1"));
  await flushPendingSyncWrites();
  const b = await chatDevice(a.sync);
  await loadChatContent("one");
  await saveChat(chat("one", "m1", "from b"));
  await flushPendingSyncWrites();

  // Back on A: the open chat is checked against the cloud while the user
  // sends a message.
  installBrowser(a.local, a.sync);
  await refresh();
  const get = a.sync.area.get;
  let reached!: () => void;
  const fetching = new Promise<void>((resolve) => (reached = resolve));
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  a.sync.area.get = async (key: string | null) => {
    if (key === "chats/one") {
      a.sync.area.get = get;
      reached();
      await released;
    }
    return get(key);
  };
  const check = refreshChatContent("one");
  await fetching;
  await saveChatContent("one", { messages: messages("m1", "from a") });
  release();
  await check;
  await flushPendingSyncWrites();
  assert.deepEqual(await cloudTexts("one"), ["m1", "from b", "from a"]);
  assert.deepEqual(texts(await loadChatContent("one")), [
    "m1",
    "from b",
    "from a",
  ]);

  // B edits without having seen A's message; its upload brings it along.
  installBrowser(b.local, a.sync);
  await saveChatContent("one", { messages: messages("m1", "from b", "b2") });
  await flushPendingSyncWrites();
  assert.deepEqual(texts(await readLocalChatContent("one"))?.sort(), [
    "b2",
    "from a",
    "from b",
    "m1",
  ]);
});

test("content missing from the cloud is uploaded again", async () => {
  const { local, sync } = installBrowser();
  local.data[STORAGE_KEYS.syncDataSettings] = {
    ...DEFAULT_SYNC_DATA_SETTINGS,
    syncChats: true,
  };
  await saveChat(chat("one", "hello"));
  const get = sync.area.get;
  sync.area.get = async (key: string | null) => {
    if (key?.startsWith("chats/")) throw new Error("offline");
    return get(key);
  };
  await setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
  sync.area.get = get;
  await flushPendingSyncWrites();
  await refresh();
  await flushPendingSyncWrites();
  assert.deepEqual(await cloudTexts("one"), ["hello"]);

  // Another device clears the cloud; renaming the chat stores its content
  // again.
  installBrowser(undefined, sync);
  await browserSync().remove(STORAGE_KEYS.chats);
  installBrowser(local, sync);
  await storage.chats.update((chats) =>
    chats.map((item) => ({ ...item, title: "renamed" })),
  );
  await flushPendingSyncWrites();
  assert.deepEqual(await cloudTexts("one"), ["hello"]);
});

test("a streaming reply's content uploads once the run ends or goes stale", async () => {
  await chatDevice();
  const start = Date.now();
  const running: Chat = {
    ...chat("c"),
    updatedAt: start,
    messages: [
      {
        id: "a",
        role: "assistant",
        content: "partial",
        createdAt: start,
        metadata: { runMetrics: { startedAt: start } },
      },
    ],
  };
  await saveChat(running);
  await flushPendingSyncWrites();
  assert.deepEqual(ids(await browserSync().read(STORAGE_KEYS.chats)), ["c"]);
  assert.equal(await cloudTexts("c"), undefined, "held while streaming");
  // A run whose panel closed long ago never ends; a refresh uploads it.
  const now = Date.now;
  mock.method(Date, "now", () => now() + 60 * 60_000);
  await refresh();
  await flushPendingSyncWrites();
  assert.deepEqual(await cloudTexts("c"), ["partial"]);
});

test("turning chat sync off keeps chats never opened here", async () => {
  const { sync } = await chatDevice();
  await saveChat(chat("one", "m1"));
  await saveChat(chat("two", "m2"));
  await flushPendingSyncWrites();

  // Online: the content of a chat never opened is downloaded first.
  await chatDevice(sync);
  await setDataSync(SYNC_PREFERENCES.chats, false);
  assert.deepEqual(texts(await loadChatContent("two")), ["m2"]);

  // Offline: sync still turns off; the chat stays listed but unavailable.
  await chatDevice(sync);
  sync.area.get = async () => {
    throw new Error("offline");
  };
  await setActiveSyncBackend(NO_SYNC_BACKEND_ID);
  assert.equal(await storage.activeSyncBackendId.get(), NO_SYNC_BACKEND_ID);
  assert.deepEqual(ids(await storage.chats.get()), ["one", "two"]);
  await assert.rejects(loadChatContent("two"), /not available/);
});

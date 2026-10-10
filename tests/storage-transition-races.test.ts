import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
  storage,
  setActiveSyncBackend,
  setDataSync,
  clearPendingSyncWrites,
  flushPendingSyncWrites,
} from "../src/shared/storage";
import { STORAGE_KEYS, SYNC_PREFERENCES } from "../src/shared/storage-keys";
import { DEFAULT_SYNC_DATA_SETTINGS } from "../src/shared/sync-data-settings";
import {
  BROWSER_SYNC_BACKEND_ID,
  NO_SYNC_BACKEND_ID,
  registerSyncBackendImpl,
  type SyncBackend,
  type SyncBackendImpl,
} from "../src/shared/sync-backends";
import { normalizeChats } from "../src/shared/chats";
import {
  syncLocalCacheKey,
  queueSyncWrite,
} from "../src/shared/storage-sync-cache";
import { refreshSyncFromRemote } from "../src/shared/storage-remote-sync";
import { restoreSyncBackendFromCloud } from "../src/shared/storage-sync-transition";
import { installBrowser, holdMethod } from "./helpers";
import type { Chat, ProviderState } from "../src/shared/types";

afterEach(() => {
  clearPendingSyncWrites();
  mock.restoreAll();
});

function fixture(active = true) {
  const { local } = installBrowser();
  const remote: Record<string, unknown> = {};
  const backend: SyncBackend = {
    config: {
      id: BROWSER_SYNC_BACKEND_ID,
      type: "browser-sync",
      name: "Fixture",
    },
    async read<T>(key: string) {
      return structuredClone(remote[key]) as T | undefined;
    },
    async write<T>(key: string, value: T) {
      const next =
        key === STORAGE_KEYS.provider
          ? { ...(remote[key] as object), ...value }
          : value;
      remote[key] = structuredClone(next);
      return next as T;
    },
    async remove(key) {
      delete remote[key];
    },
    async test() {},
  };
  registerSyncBackendImpl({
    createSyncBackend: () => backend,
  } as SyncBackendImpl);
  if (active)
    local.data[STORAGE_KEYS.activeSyncBackendId] = BROWSER_SYNC_BACKEND_ID;
  const settings = {
    ...DEFAULT_SYNC_DATA_SETTINGS,
    syncProviders: false,
    syncChats: false,
  };
  local.data[STORAGE_KEYS.syncDataSettings] = settings;
  local.data[syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)] = {
    value: settings,
    updatedAt: 1,
    flushedAt: 1,
  };
  remote[STORAGE_KEYS.syncDataSettings] = settings;
  return { local, remote, backend };
}

const provider = (id: string) =>
  ({ [id]: { id, type: "openai", models: [] } }) as ProviderState;
const chat = (messages: Chat["messages"] = []): Chat => ({
  id: "chat",
  title: "Fixture",
  createdAt: 1,
  updatedAt: messages.length + 1,
  messages,
});

test("category transition merges every local provider and survives immediate refresh, disable and re-enable", async () => {
  const { remote } = fixture();
  remote[STORAGE_KEYS.provider] = provider("cloud");
  await storage.provider.set({
    ...provider("local-one"),
    ...provider("local-two"),
  });
  await setDataSync(SYNC_PREFERENCES.providers, true);
  await refreshSyncFromRemote(await storage.syncDataSettings.get());
  assert.deepEqual(Object.keys(await storage.provider.get()).sort(), [
    "cloud",
    "local-one",
    "local-two",
  ]);
  await setDataSync(SYNC_PREFERENCES.providers, false);
  await storage.provider.set({
    ...(await storage.provider.get()),
    ...provider("later"),
  });
  await setDataSync(SYNC_PREFERENCES.providers, true);
  await flushPendingSyncWrites();
  await refreshSyncFromRemote(await storage.syncDataSettings.get());
  assert.deepEqual(Object.keys(await storage.provider.get()).sort(), [
    "cloud",
    "later",
    "local-one",
    "local-two",
  ]);
});

test("failed category migration leaves its local data and flag active", async () => {
  const { backend } = fixture();
  await storage.provider.set(provider("local"));
  mock.method(backend, "write", async () => {
    throw new Error("fixture write failure");
  });
  await assert.rejects(
    setDataSync(SYNC_PREFERENCES.providers, true),
    /fixture write failure/,
  );
  assert.equal((await storage.syncDataSettings.get()).syncProviders, false);
  assert.deepEqual(await storage.provider.get(), provider("local"));
});

test("a stored flag alone cannot skip category data migration", async () => {
  const { remote } = fixture();
  remote[STORAGE_KEYS.provider] = provider("cloud");
  await storage.provider.set(provider("local"));
  await storage.syncDataSettings.set({
    ...(await storage.syncDataSettings.get()),
    syncProviders: true,
  });
  await setDataSync(SYNC_PREFERENCES.providers, true);
  assert.deepEqual(Object.keys(await storage.provider.get()).sort(), [
    "cloud",
    "local",
  ]);
});

test("a flush from a previous backend cannot publish into the activated backend cache", async () => {
  const { local, backend } = fixture();
  await storage.language.set("en-US");
  clearPendingSyncWrites();
  let writes = 0;
  const oldBackend = {
    ...backend,
    config: { ...backend.config, id: "previous-backend" },
    async write() {
      writes++;
      return "old backend result";
    },
  } as SyncBackend;
  // The queued operation can start after a backend switch; matching values alone
  // are insufficient to establish that its result belongs to the active cache.
  local.data[STORAGE_KEYS.activeSyncBackendId] = BROWSER_SYNC_BACKEND_ID;
  const flush = queueSyncWrite(oldBackend, STORAGE_KEYS.language, "en-US", {
    delayMs: 0,
  });
  await flush;
  assert.equal(
    writes,
    0,
    "obsolete routing must be rejected before the backend write",
  );
  assert.equal(await storage.language.get(), "en-US");
});

for (const operation of ["read", "write"] as const) {
  test(`backend activation keeps a local language edit during remote ${operation}`, async () => {
    const { backend } = fixture(false);
    await storage.language.set("en-US");
    const hold = holdMethod(
      backend,
      operation,
      (key) =>
        key ===
        (operation === "read"
          ? STORAGE_KEYS.syncDataSettings
          : STORAGE_KEYS.language),
    );
    const activation = setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
    await hold.started;
    await storage.language.set("de-DE");
    assert.equal(
      await storage.language.get(),
      "de-DE",
      "edits remain available during remote I/O",
    );
    hold.release();
    await activation;
    assert.equal(await storage.language.get(), "de-DE");
  });

  test(`enabling chat sync preserves a streamed message edited during remote ${operation}`, async () => {
    const { backend, remote } = fixture();
    await storage.chats.set([chat()]);
    const hold = holdMethod(
      backend,
      operation,
      (key) => key === STORAGE_KEYS.chats,
    );
    const transition = setDataSync(SYNC_PREFERENCES.chats, true);
    await hold.started;
    const edited = normalizeChats([
      chat([
        {
          id: "user",
          role: "user",
          content: "Keep this message",
          createdAt: 2,
        },
      ]),
    ]);
    await storage.chats.set(edited);
    hold.release();
    await transition;
    assert.deepEqual(await storage.chats.get(), edited);
    assert.deepEqual(
      normalizeChats(remote[STORAGE_KEYS.chats] as Chat[]),
      edited,
    );
  });
}

for (const transition of [
  "activate",
  "restore",
  "enable",
  "disable",
  "shutdown",
] as const) {
  test(`${transition} routes an edit queued during final publication to the new active store`, async () => {
    const active = transition !== "activate" && transition !== "restore";
    const { local } = fixture(active);
    const category = transition === "enable" || transition === "disable";
    if (transition === "disable")
      await setDataSync(SYNC_PREFERENCES.providers, true);
    const hold = holdMethod(local.area, "set", (values) =>
      category
        ? syncLocalCacheKey(STORAGE_KEYS.syncDataSettings) in values
        : STORAGE_KEYS.activeSyncBackendId in values,
    );
    const change =
      transition === "activate"
        ? setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID)
        : transition === "restore"
          ? restoreSyncBackendFromCloud({
              backendId: BROWSER_SYNC_BACKEND_ID,
              language: "fr-FR",
            })
          : transition === "shutdown"
            ? setActiveSyncBackend(NO_SYNC_BACKEND_ID)
            : setDataSync(SYNC_PREFERENCES.providers, transition === "enable");
    await hold.started;
    const edit = category
      ? storage.provider.set(provider("latest"))
      : storage.language.set("de-DE");
    hold.release();
    await Promise.all([change, edit]);
    assert.deepEqual(
      category ? await storage.provider.get() : await storage.language.get(),
      category ? provider("latest") : "de-DE",
    );
  });
}

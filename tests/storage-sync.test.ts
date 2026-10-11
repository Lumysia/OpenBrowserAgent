import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { installBrowser } from "./helpers";
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
  syncLocalCacheKey,
  STORAGE_KEYS,
  SYNC_PREFERENCES,
} from "../src/shared/storage";
import {
  refreshSyncDataFromRemote,
  refreshSyncSettingsFromRemote,
} from "../src/shared/storage-sync";
import { clearAppStorage } from "../src/shared/storage-debug";
import { DEFAULT_SYNC_DATA_SETTINGS } from "../src/shared/storage-keys";
import type { Chat, ProviderState } from "../src/shared/types";

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
const providers = (...ids: string[]): ProviderState =>
  Object.fromEntries(
    ids.map((id) => [
      id,
      { id, type: "openai", apiKey: `${id}-key`, models: [] },
    ]),
  ) as ProviderState;
const chat = (id: string): Chat => ({
  id,
  title: id,
  createdAt: 1,
  updatedAt: 1,
  messages: [],
});
const ids = (value: unknown) =>
  (Array.isArray(value)
    ? value.map((item: { id: string }) => item.id)
    : Object.keys(value || {})
  ).sort();
const refresh = async () => {
  await refreshSyncSettingsFromRemote();
  await refreshSyncDataFromRemote();
};

// This device has local data; sync starts on the given backend id.
function device(settings: Partial<typeof DEFAULT_SYNC_DATA_SETTINGS> = {}) {
  const browser = installBrowser();
  const merged = { ...DEFAULT_SYNC_DATA_SETTINGS, ...settings };
  browser.local.data[STORAGE_KEYS.syncDataSettings] = merged;
  return browser;
}

async function activeDevice(
  settings: Partial<typeof DEFAULT_SYNC_DATA_SETTINGS> = {},
) {
  const browser = device(settings);
  await setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
  return browser;
}

test("a failed sync write stays visible in the sync status", async () => {
  await activeDevice();
  await storage.provider.set({
    big: { id: "big", type: "openai", apiKey: "x".repeat(9000), models: [] },
  } as unknown as ProviderState);
  await flushPendingSyncWrites();
  const status = await storage.syncWriteStatus.get();
  assert.equal(status.pendingCount, 0);
  assert.match(status.lastError || "", /per-item limit/);
});

test("an over-quota item does not block turning sync off or on", async () => {
  const big = {
    big: { id: "big", type: "openai", apiKey: "x".repeat(9000), models: [] },
  } as unknown as ProviderState;
  const { local } = device();
  local.data[STORAGE_KEYS.provider] = big;
  await setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
  assert.equal(
    await storage.activeSyncBackendId.get(),
    BROWSER_SYNC_BACKEND_ID,
  );
  assert.deepEqual(await storage.provider.get(), big);
  assert.match(
    (await storage.syncWriteStatus.get()).lastError || "",
    /per-item limit/,
  );

  await setDataSync(SYNC_PREFERENCES.providers, false);
  assert.deepEqual(await storage.provider.get(), big);
  await setDataSync(SYNC_PREFERENCES.providers, true).catch(() => undefined);
  await setActiveSyncBackend(NO_SYNC_BACKEND_ID);
  assert.deepEqual(await storage.provider.get(), big);
});

test("activation merges a category this device kept local into the account's synced data", async () => {
  const { local } = installBrowser();
  const backend = browserSync();
  await backend.write(STORAGE_KEYS.syncDataSettings, {
    ...DEFAULT_SYNC_DATA_SETTINGS,
    syncChats: true,
  });
  await backend.write(STORAGE_KEYS.chats, [chat("remote")]);
  // Another device wrote those; this device only has its own chats.
  for (const key of Object.keys(local.data)) delete local.data[key];
  local.data[STORAGE_KEYS.chats] = [chat("local-1"), chat("local-2")];

  await setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
  assert.deepEqual(ids(await storage.chats.get()), [
    "local-1",
    "local-2",
    "remote",
  ]);
  await storage.chats.set([...(await storage.chats.get()), chat("new")]);
  await flushPendingSyncWrites();
  assert.deepEqual(ids(await backend.read(STORAGE_KEYS.chats)), [
    "local-1",
    "local-2",
    "new",
    "remote",
  ]);
  assert.ok(local.data[STORAGE_KEYS.chats], "the local copy is kept");
});

test("activation does not upload a category the account keeps local", async () => {
  const { local, sync } = installBrowser();
  await browserSync().write(STORAGE_KEYS.syncDataSettings, {
    ...DEFAULT_SYNC_DATA_SETTINGS,
    syncProviders: false,
  });
  for (const key of Object.keys(local.data)) delete local.data[key];
  local.data[STORAGE_KEYS.provider] = providers("p");

  await setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
  assert.equal(sync.data[STORAGE_KEYS.provider], undefined);
  assert.deepEqual(await storage.provider.get(), providers("p"));
});

for (const kind of ["category", "backend"] as const) {
  test(`${kind} activation keeps cloud items and local items`, async () => {
    const { local } = installBrowser();
    await browserSync().write(STORAGE_KEYS.provider, providers("cloud"));
    for (const key of Object.keys(local.data)) delete local.data[key];
    local.data[STORAGE_KEYS.provider] = providers("local");
    local.data[STORAGE_KEYS.syncDataSettings] = {
      ...DEFAULT_SYNC_DATA_SETTINGS,
      syncProviders: kind === "backend",
    };
    if (kind === "category") {
      await setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
      await setDataSync(SYNC_PREFERENCES.providers, true);
    } else await setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
    assert.deepEqual(ids(await storage.provider.get()), ["cloud", "local"]);
    assert.deepEqual(ids(await browserSync().read(STORAGE_KEYS.provider)), [
      "cloud",
      "local",
    ]);
  });
}

// Run `edit` as a second device that shares this device's browser-sync area.
async function onOtherDevice(edit: () => Promise<void>) {
  const self = globalThis.chrome;
  installBrowser(undefined, { area: self.storage.sync } as never);
  try {
    await edit();
  } finally {
    Object.assign(globalThis, { chrome: self });
  }
}

test("re-enabling a category merges remote edits and local deletions made while it was off", async () => {
  await activeDevice();
  await storage.provider.set(providers("a", "b"));
  await flushPendingSyncWrites();
  await setDataSync(SYNC_PREFERENCES.providers, false);

  await onOtherDevice(async () => {
    const backend = browserSync();
    await backend.write(STORAGE_KEYS.provider, {
      ...(await backend.read<ProviderState>(STORAGE_KEYS.provider)),
      ...providers("c"),
    });
  });
  const { a: _deleted, ...rest } = await storage.provider.get();
  await storage.provider.set(rest);

  await setDataSync(SYNC_PREFERENCES.providers, true);
  await flushPendingSyncWrites();
  await refresh();
  assert.deepEqual(ids(await storage.provider.get()), ["b", "c"]);
  assert.deepEqual(ids(await browserSync().read(STORAGE_KEYS.provider)), [
    "b",
    "c",
  ]);
});

test("deleting the final provider stays deleted through flush and refresh", async () => {
  await activeDevice();
  await storage.provider.set(providers("only"));
  await flushPendingSyncWrites();
  await storage.provider.set({});
  await flushPendingSyncWrites();
  await refresh();
  assert.deepEqual(await storage.provider.get(), {});
  assert.deepEqual(await browserSync().read(STORAGE_KEYS.provider), {});
});

test("an older flush cannot erase a newer edit", async () => {
  await activeDevice();
  const backend = browserSync();
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let held = false;
  registerSyncBackendImpl({
    ...backendImpl,
    createSyncBackend: () => ({
      ...backend,
      async write<T>(key: string, value: T) {
        if (key === STORAGE_KEYS.provider && !held) {
          held = true;
          started.resolve();
          await release.promise;
        }
        return backend.write(key, value);
      },
    }),
  });
  await storage.provider.set(providers("old"));
  const flushing = flushPendingSyncWrites();
  await started.promise;
  await storage.provider.set(providers("new"));
  release.resolve();
  await flushing;
  assert.deepEqual(ids(await storage.provider.get()), ["new"]);
  await flushPendingSyncWrites();
  assert.deepEqual(ids(await backend.read(STORAGE_KEYS.provider)), ["new"]);
});

test("a failed category migration leaves its data and flag local", async () => {
  const { local } = await activeDevice({ syncProviders: false });
  local.data[STORAGE_KEYS.provider] = providers("local");
  registerSyncBackendImpl({
    ...backendImpl,
    createSyncBackend: (config) => ({
      ...backendImpl.createSyncBackend(config),
      async write() {
        throw new Error("fixture write failure");
      },
    }),
  });
  await assert.rejects(
    setDataSync(SYNC_PREFERENCES.providers, true),
    /fixture write failure/,
  );
  assert.equal((await storage.syncDataSettings.get()).syncProviders, false);
  assert.deepEqual(await storage.provider.get(), providers("local"));
});

for (const enabled of [false, true]) {
  test(`disabling the backend keeps the ${enabled ? "synced" : "local"} values`, async () => {
    const { local } = await activeDevice({
      syncProviders: enabled,
      syncChats: enabled,
    });
    local.data[STORAGE_KEYS.chats] = [chat("local")];
    local.data[STORAGE_KEYS.provider] = providers("local");
    if (enabled) {
      await storage.chats.set([chat("synced")]);
      await storage.provider.set(providers("synced"));
      await flushPendingSyncWrites();
    }
    await storage.language.set("fr-FR");
    await setActiveSyncBackend(NO_SYNC_BACKEND_ID);
    assert.equal(await storage.language.get(), "fr-FR");
    const expected = enabled ? "synced" : "local";
    assert.deepEqual(ids(await storage.chats.get()), [expected]);
    assert.deepEqual(ids(await storage.provider.get()), [expected]);
  });
}

test("another device turning a category off keeps its synced value here", async () => {
  await activeDevice({ syncChats: true });
  await storage.chats.set([chat("synced")]);
  await flushPendingSyncWrites();
  await onOtherDevice(() =>
    browserSync()
      .write(STORAGE_KEYS.syncDataSettings, {
        ...DEFAULT_SYNC_DATA_SETTINGS,
        syncChats: false,
      })
      .then(() => undefined),
  );
  await refreshSyncSettingsFromRemote();
  assert.equal((await storage.syncDataSettings.get()).syncChats, false);
  assert.deepEqual(ids(await storage.chats.get()), ["synced"]);
});

test("clearing local data removes every synced replica", async () => {
  const { local } = await activeDevice();
  await storage.provider.set(providers("p"));
  await flushPendingSyncWrites();
  assert.ok(
    Object.keys(local.data).some((k) => k.startsWith("tinybase-sync-doc:")),
  );
  assert.ok(local.data[syncLocalCacheKey(STORAGE_KEYS.provider)]);

  await clearAppStorage({ scope: "local", targets: ["all"] });
  assert.deepEqual(
    Object.keys(local.data).filter((k) => k.startsWith("tinybase-sync-doc:")),
    [],
  );
  assert.ok(!JSON.stringify(local.data).includes("p-key"));
});

import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { installBrowser } from "./helpers";
import { createSyncBackend } from "../src/shared/sync-backends-impl";
import {
  BROWSER_SYNC_BACKEND_ID,
  registerSyncBackendImpl,
  type SyncBackendImpl,
  type SyncBackend,
} from "../src/shared/sync-backends";
import {
  storage,
  setDataSync,
  setActiveSyncBackend,
  flushPendingSyncWrites,
  clearPendingSyncWrites,
} from "../src/shared/storage";
import { refreshSyncFromRemote } from "../src/shared/storage-remote-sync";
import { restoreSyncBackendFromCloud } from "../src/shared/storage-sync-transition";
import { STORAGE_KEYS, SYNC_PREFERENCES } from "../src/shared/storage-keys";
import { DEFAULT_SYNC_DATA_SETTINGS } from "../src/shared/sync-data-settings";
import { syncLocalCacheKey } from "../src/shared/storage-sync-cache";
import type { ProviderState } from "../src/shared/types";

afterEach(() => {
  clearPendingSyncWrites();
  mock.restoreAll();
  mock.timers.reset();
});

const providers = (...ids: string[]): ProviderState =>
  Object.fromEntries(ids.map((id) => [id, { id, type: "openai", models: [] }]));

function fixture() {
  mock.timers.enable({ apis: ["setTimeout"] });
  const { local } = installBrowser();
  const backend = createSyncBackend({
    id: BROWSER_SYNC_BACKEND_ID,
    type: "browser-sync",
    name: "Fixture",
  });
  registerSyncBackendImpl({
    createSyncBackend: () => backend,
  } as SyncBackendImpl);
  local.data[STORAGE_KEYS.activeSyncBackendId] = BROWSER_SYNC_BACKEND_ID;
  local.data[syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)] = {
    value: DEFAULT_SYNC_DATA_SETTINGS,
    updatedAt: 1,
    flushedAt: 1,
  };
  return { local, backend };
}

function holdWrite(backend: SyncBackend, key: string) {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const write = backend.write.bind(backend);
  let held = false;
  mock.method(backend, "write", async (requested: string, value: unknown) => {
    if (requested === key && !held) {
      held = true;
      started.resolve();
      await release.promise;
    }
    return write(requested, value);
  });
  return { started: started.promise, release: release.resolve };
}

async function assertProviders(backend: SyncBackend, expected: ProviderState) {
  assert.deepEqual(
    await backend.read(STORAGE_KEYS.provider),
    expected,
    "remote dataset after queue drain",
  );
  await refreshSyncFromRemote(await storage.syncDataSettings.get());
  assert.deepEqual(
    await storage.provider.get(),
    expected,
    "active dataset after refresh",
  );
}

for (const edit of ["add", "delete"] as const) {
  test(`queued sync v2 snapshot cannot undo disable/re-enable with local ${edit}`, async () => {
    const { backend } = fixture();
    await storage.provider.set(providers("original", "obsolete"));
    await setDataSync(SYNC_PREFERENCES.providers, false);
    const next =
      edit === "add"
        ? providers("original", "obsolete", "later")
        : providers("original");
    await storage.provider.set(next);
    await setDataSync(SYNC_PREFERENCES.providers, false);
    await setDataSync(SYNC_PREFERENCES.providers, true);
    assert.deepEqual(await backend.read(STORAGE_KEYS.provider), next);
    await flushPendingSyncWrites();
    await assertProviders(backend, next);
  });

  test(`in-flight sync v2 upload finishes before disable; local ${edit} remains editable and survives re-enable`, async () => {
    const { backend } = fixture();
    await storage.provider.set(providers("original", "obsolete"));
    const hold = holdWrite(backend, STORAGE_KEYS.provider);
    const flush = flushPendingSyncWrites();
    await hold.started;
    let disabled = false;
    const transition = setDataSync(SYNC_PREFERENCES.providers, false).then(
      () => {
        disabled = true;
      },
    );
    const next =
      edit === "add"
        ? providers("original", "obsolete", "later")
        : providers("original");
    await storage.provider.set(next);
    assert.deepEqual(
      await storage.provider.get(),
      next,
      "ordinary local setters must not wait for remote I/O",
    );
    assert.equal(
      disabled,
      false,
      "transition cannot overtake the in-flight upload",
    );
    hold.release();
    await Promise.all([flush, transition]);
    await setDataSync(SYNC_PREFERENCES.providers, true);
    await flushPendingSyncWrites();
    await assertProviders(backend, next);
  });
}

test("queued settings cannot undo a category migration or its next refresh", async () => {
  const { backend } = fixture();
  await storage.syncDataSettings.set({
    ...DEFAULT_SYNC_DATA_SETTINGS,
    syncProviders: false,
  });
  await storage.provider.set(providers("local"));
  await setDataSync(SYNC_PREFERENCES.providers, true);
  await flushPendingSyncWrites();
  assert.equal(
    (
      await backend.read<typeof DEFAULT_SYNC_DATA_SETTINGS>(
        STORAGE_KEYS.syncDataSettings,
      )
    )?.syncProviders,
    true,
  );
  await assertProviders(backend, providers("local"));
});

test("an in-flight refresh upload shares transition ownership", async () => {
  const { backend } = fixture();
  await storage.provider.set(providers("original"));
  const hold = holdWrite(backend, STORAGE_KEYS.provider);
  const refresh = refreshSyncFromRemote(await storage.syncDataSettings.get());
  await hold.started;
  let restored = false;
  const restore = restoreSyncBackendFromCloud({
    backendId: BROWSER_SYNC_BACKEND_ID,
    data: { [STORAGE_KEYS.provider]: providers("cloud") },
  }).then(() => {
    restored = true;
  });
  await storage.provider.set(providers("original", "later"));
  assert.equal(restored, false);
  hold.release();
  await Promise.all([refresh, restore]);
  await flushPendingSyncWrites();
  assert.deepEqual(await storage.provider.get(), providers("cloud"));
  assert.deepEqual(
    await backend.read(STORAGE_KEYS.provider),
    providers("original"),
    "the stale queued edit must not upload after explicit restore",
  );
});

test("an in-flight settings snapshot cannot overtake enabling its category", async () => {
  const { backend } = fixture();
  await storage.syncDataSettings.set({
    ...DEFAULT_SYNC_DATA_SETTINGS,
    syncProviders: false,
  });
  const hold = holdWrite(backend, STORAGE_KEYS.syncDataSettings);
  const flush = flushPendingSyncWrites();
  await hold.started;
  let enabled = false;
  const transition = setDataSync(SYNC_PREFERENCES.providers, true).then(() => {
    enabled = true;
  });
  await storage.provider.set(providers("local"));
  assert.equal(enabled, false);
  hold.release();
  await Promise.all([flush, transition]);
  await flushPendingSyncWrites();
  assert.equal(
    (
      await backend.read<typeof DEFAULT_SYNC_DATA_SETTINGS>(
        STORAGE_KEYS.syncDataSettings,
      )
    )?.syncProviders,
    true,
  );
  await assertProviders(backend, providers("local"));
});

test("queued remove stays pending across reads, but cannot delete a restored snapshot", async () => {
  const { backend } = fixture();
  await storage.provider.set(providers("original"));
  await flushPendingSyncWrites();
  await storage.provider.remove();
  assert.deepEqual(await storage.provider.get(), providers());
  await flushPendingSyncWrites();
  assert.equal(await backend.read(STORAGE_KEYS.provider), undefined);
  await storage.provider.set(providers("replacement"));
  await flushPendingSyncWrites();
  await storage.provider.remove();
  await restoreSyncBackendFromCloud({
    backendId: BROWSER_SYNC_BACKEND_ID,
    data: { [STORAGE_KEYS.provider]: providers("replacement") },
  });
  await flushPendingSyncWrites();
  await assertProviders(backend, providers("replacement"));
});

test("queued old-backend data cannot run after switching away and back", async () => {
  const { backend } = fixture();
  await storage.provider.set(providers("original"));
  await setActiveSyncBackend("local");
  await storage.provider.set(providers("original", "later"));
  await storage.syncDataSettings.set(DEFAULT_SYNC_DATA_SETTINGS);
  await setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
  await flushPendingSyncWrites();
  await assertProviders(backend, providers("original", "later"));
});

for (const inFlight of [false, true]) {
  for (const edit of ["add", "delete"] as const) {
    test(`sync v2 chats retain ${edit} across ${inFlight ? "in-flight" : "queued"} upload and disable/re-enable`, async () => {
      const { local, backend } = fixture();
      local.data[syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)] = {
        value: { ...DEFAULT_SYNC_DATA_SETTINGS, syncChats: true },
        updatedAt: 1,
        flushedAt: 1,
      };
      const chats = (ids: string[]) =>
        ids.map((id) => ({
          id,
          title: id,
          createdAt: 1,
          updatedAt: 1,
          messages: [
            {
              id: `${id}-message`,
              role: "user" as const,
              content: id,
              createdAt: 1,
            },
          ],
        }));
      const expectedIds =
        edit === "add" ? ["keep", "later", "obsolete"] : ["keep"];
      await storage.chats.set(chats(["keep", "obsolete"]));
      const hold = inFlight
        ? holdWrite(backend, STORAGE_KEYS.chats)
        : undefined;
      const flush = inFlight ? flushPendingSyncWrites() : undefined;
      if (hold) await hold.started;
      const disable = setDataSync(SYNC_PREFERENCES.chats, false);
      if (hold) {
        await storage.chats.set(chats(expectedIds));
        hold.release();
      }
      await Promise.all([disable, flush]);
      await storage.chats.set(chats(expectedIds));
      await setDataSync(SYNC_PREFERENCES.chats, true);
      await flushPendingSyncWrites();
      const remote = await backend.read<
        Array<{ id: string; messages: unknown[] }>
      >(STORAGE_KEYS.chats);
      assert.deepEqual(remote?.map((chat) => chat.id).sort(), expectedIds);
      assert.ok(remote?.every((chat) => chat.messages.length === 1));
      await refreshSyncFromRemote(await storage.syncDataSettings.get());
      assert.deepEqual(
        (await storage.chats.get()).map((chat) => chat.id).sort(),
        expectedIds,
      );
    });
  }
}

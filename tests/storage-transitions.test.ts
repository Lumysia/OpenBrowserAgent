import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { installBrowser } from "./helpers";
import {
  storage,
  setActiveSyncBackend,
  clearPendingSyncWrites,
} from "../src/shared/storage";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import { DEFAULT_SYNC_DATA_SETTINGS } from "../src/shared/sync-data-settings";
import { STORAGE_KEYS, SYNCABLE_DATA_ITEMS } from "../src/shared/storage-keys";
import {
  BROWSER_SYNC_BACKEND_ID,
  NO_SYNC_BACKEND_ID,
  registerSyncBackendImpl,
  type SyncBackend,
  type SyncBackendImpl,
} from "../src/shared/sync-backends";
import {
  syncLocalCacheKey,
  writeSyncLocalCache,
} from "../src/shared/storage-sync-cache";
import { restoreSyncBackendFromCloud } from "../src/shared/storage-sync-transition";

afterEach(() => {
  clearPendingSyncWrites();
  mock.restoreAll();
});

test("backend activation publishes merged values after default getters initialize their caches", async () => {
  installBrowser();
  registerSyncBackendImpl({
    createSyncBackend: () =>
      ({
        async read() {
          return undefined;
        },
        async write(key, value) {
          return key === STORAGE_KEYS.language ? "fr-FR" : value;
        },
      }) as SyncBackend,
  } as SyncBackendImpl);
  await setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
  assert.equal(await storage.language.get(), "fr-FR");
});

for (const editDuringRestore of ["none", "local", "cache"]) {
  test(`explicit cloud restore ${editDuringRestore !== "none" ? `preserves a newer ${editDuringRestore} edit` : "replaces an existing pending cache"}`, async () => {
    const { local } = installBrowser();
    local.data[syncLocalCacheKey(STORAGE_KEYS.language)] = {
      value: "en-US",
      updatedAt: 1,
    };
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const get = local.area.get.bind(local.area);
    let held = false;
    if (editDuringRestore !== "none")
      mock.method(local.area, "get", async (key) => {
        const result = await get(key);
        if (key === STORAGE_KEYS.language && !held) {
          held = true;
          started.resolve();
          await release.promise;
        }
        return result;
      });
    const restore = restoreSyncBackendFromCloud({
      backendId: BROWSER_SYNC_BACKEND_ID,
      language: "fr-FR",
    });
    if (editDuringRestore !== "none") {
      await started.promise;
      const edit =
        editDuringRestore === "local"
          ? storage.language.set("de-DE")
          : writeSyncLocalCache(STORAGE_KEYS.language, "de-DE");
      release.resolve();
      await edit;
    }
    await restore;
    assert.equal(
      await storage.language.get(),
      editDuringRestore !== "none" ? "de-DE" : "fr-FR",
    );
  });
}

for (const enabled of [false, true]) {
  test(`disabling a backend preserves the active ${enabled ? "synced" : "local"} category values`, async () => {
    const { local } = installBrowser();
    local.data[STORAGE_KEYS.activeSyncBackendId] = BROWSER_SYNC_BACKEND_ID;
    const settings = { ...DEFAULT_SYNC_DATA_SETTINGS };
    for (const { preferenceKey, dataKey } of SYNCABLE_DATA_ITEMS) {
      settings[preferenceKey] = enabled;
      local.data[dataKey] = [{ id: "local", value: "current local data" }];
      local.data[syncLocalCacheKey(dataKey)] = {
        value: [{ id: "remote", value: "cached remote data" }],
        updatedAt: 1,
        flushedAt: 1,
      };
    }
    local.data[syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)] = {
      value: settings,
      updatedAt: 1,
      flushedAt: 1,
    };
    local.data[syncLocalCacheKey(STORAGE_KEYS.preferences)] = {
      value: DEFAULT_PREFERENCES,
      updatedAt: 1,
      flushedAt: 1,
    };
    local.data[syncLocalCacheKey(STORAGE_KEYS.language)] = {
      value: "fr-FR",
      updatedAt: 1,
      flushedAt: 1,
    };
    await setActiveSyncBackend(NO_SYNC_BACKEND_ID);
    assert.equal(await storage.activeSyncBackendId.get(), NO_SYNC_BACKEND_ID);
    assert.equal(await storage.language.get(), "fr-FR");
    for (const { dataKey } of SYNCABLE_DATA_ITEMS) {
      assert.deepEqual(
        local.data[dataKey],
        [
          {
            id: enabled ? "remote" : "local",
            value: enabled ? "cached remote data" : "current local data",
          },
        ],
        dataKey,
      );
    }
  });
}

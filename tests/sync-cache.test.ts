import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { installBrowser } from "./helpers";
import {
  clearPendingSyncWrites,
  flushPendingSyncWrites,
  queueSyncWrite,
  readPendingSyncValue,
  readSyncLocalValue,
  writeSyncLocalCache,
} from "../src/shared/storage-sync-cache";
import {
  registerSyncBackendImpl,
  BROWSER_SYNC_BACKEND_ID,
  type SyncBackend,
  type SyncBackendImpl,
} from "../src/shared/sync-backends";
import { refreshSyncSettingsFromRemote } from "../src/shared/storage-remote-sync";
import { DEFAULT_SYNC_DATA_SETTINGS } from "../src/shared/sync-data-settings";
import { markSyncLocalCacheFlushed } from "../src/shared/storage-sync-cache";
import { STORAGE_KEYS } from "../src/shared/storage-keys";

afterEach(() => clearPendingSyncWrites());

for (const newerQueued of [false, true]) {
  test(`an older flush cannot erase a newer ${newerQueued ? "queued edit" : "locally staged streaming snapshot"}`, async () => {
    const { local } = installBrowser();
    local.data[STORAGE_KEYS.activeSyncBackendId] = "fixture";
    local.data[STORAGE_KEYS.syncDataSettings] = {
      ...DEFAULT_SYNC_DATA_SETTINGS,
      syncChats: true,
    };
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let writes = 0;
    const backend = {
      config: { id: "fixture", type: "browser-sync", name: "Fixture" },
      async write(_key, value) {
        if (++writes === 1) {
          started.resolve();
          await release.promise;
        }
        return value;
      },
    } as SyncBackend;
    await writeSyncLocalCache("chats", "old");
    const first = queueSyncWrite(backend, "chats", "old", { delayMs: 0 });
    await started.promise;
    await writeSyncLocalCache("chats", "new");
    const second = newerQueued
      ? queueSyncWrite(backend, "chats", "new", { delayMs: 60000 })
      : undefined;
    release.resolve();
    await first;
    assert.equal(await readSyncLocalValue("chats"), "new");
    assert.equal(await readPendingSyncValue("chats"), "new");
    if (newerQueued) {
      await flushPendingSyncWrites();
      await second;
      assert.equal(await readPendingSyncValue("chats"), undefined);
    }
  });
}

for (const remote of ["remote", undefined]) {
  test(`remote ${remote === undefined ? "deletion" : "refresh"} cannot erase an edit made while reading`, async () => {
    const { local } = installBrowser();
    local.data[STORAGE_KEYS.activeSyncBackendId] = BROWSER_SYNC_BACKEND_ID;
    await markSyncLocalCacheFlushed(STORAGE_KEYS.language, "original");
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const backend = {
      config: {
        id: BROWSER_SYNC_BACKEND_ID,
        name: "Fixture",
        type: "browser-sync",
      },
      async read(key) {
        if (key === STORAGE_KEYS.language) {
          started.resolve();
          await release.promise;
          return remote;
        }
      },
    } as SyncBackend;
    registerSyncBackendImpl({
      createSyncBackend: () => backend,
    } as SyncBackendImpl);
    const refresh = refreshSyncSettingsFromRemote(DEFAULT_SYNC_DATA_SETTINGS);
    await started.promise;
    await writeSyncLocalCache(STORAGE_KEYS.language, "new local value");
    release.resolve();
    await refresh;
    assert.equal(
      await readPendingSyncValue(STORAGE_KEYS.language),
      "new local value",
    );
  });
}

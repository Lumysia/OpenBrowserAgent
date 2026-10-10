import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { build } from "esbuild";
import { browserStorage, installBrowser } from "./helpers";
import { DEFAULT_SYNC_DATA_SETTINGS } from "../src/shared/sync-data-settings";
import { STORAGE_KEYS, SYNC_PREFERENCES } from "../src/shared/storage-keys";
import {
  BROWSER_SYNC_BACKEND_ID,
  type SyncBackend,
} from "../src/shared/sync-backends";
import type * as storageModule from "../src/shared/storage";
import type * as registryModule from "../src/shared/sync-backends";
import type * as adapterModule from "../src/shared/sync-backends-impl";
import type * as remoteModule from "../src/shared/storage-remote-sync";

// Independent module graphs have independent debounce queues and fallback maps.
// Only storage and the simulated browser LockManager are shared. The production
// Browser Sync/TinyBase v2 adapter is bundled unchanged in each graph.
const bundled = await build({
  stdin: {
    contents: `export * from './src/shared/storage'; export {registerSyncBackendImpl} from './src/shared/sync-backends'; export {createSyncBackend} from './src/shared/sync-backends-impl'; export {refreshSyncFromRemote} from './src/shared/storage-remote-sync';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "esm",
});
type Context = typeof storageModule &
  Pick<typeof registryModule, "registerSyncBackendImpl"> &
  Pick<typeof adapterModule, "createSyncBackend"> &
  Pick<typeof remoteModule, "refreshSyncFromRemote">;
const url = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`;
const contexts: Context[] = await Promise.all([
  import(`${url}#first`),
  import(`${url}#second`),
]);
afterEach(() => {
  contexts.forEach((context) => context.clearPendingSyncWrites());
  mock.restoreAll();
  mock.timers.reset();
});

function installLocks() {
  const locks = new Map<string, Promise<unknown>>();
  const waiting = new Map<string, number>();
  const previous = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request(name: string, operation: () => Promise<unknown>) {
        waiting.set(name, (waiting.get(name) || 0) + 1);
        const next = (locks.get(name) ?? Promise.resolve())
          .catch(() => undefined)
          .then(() => {
            waiting.set(name, waiting.get(name)! - 1);
            return operation();
          });
        locks.set(name, next);
        return next;
      },
    },
  });
  const restore = () => {
    if (previous) Object.defineProperty(navigator, "locks", previous);
    else Reflect.deleteProperty(navigator, "locks");
  };
  return Object.assign(restore, {
    pending: (name: string) => waiting.get(name) || 0,
  });
}

for (const inFlight of [false, true]) {
  for (const edit of ["add", "delete"] as const) {
    test(`independent contexts: ${inFlight ? "in-flight" : "queued"} v2 snapshot and category ${edit}`, async () => {
      mock.timers.enable({ apis: ["setTimeout"] });
      const restoreLocks = installLocks();
      const { local } = installBrowser();
      local.data[STORAGE_KEYS.activeSyncBackendId] = BROWSER_SYNC_BACKEND_ID;
      local.data["sync-data-settings:sync-local-cache"] = {
        value: DEFAULT_SYNC_DATA_SETTINGS,
        updatedAt: 1,
        flushedAt: 1,
      };
      const [writer, options] = contexts;
      const backend = writer.createSyncBackend({
        id: BROWSER_SYNC_BACKEND_ID,
        type: "browser-sync",
        name: "Fixture",
      });
      const optionsBackend = options.createSyncBackend(backend.config);
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      let held = false;
      let flush: Promise<void> | undefined;
      writer.registerSyncBackendImpl({
        createSyncBackend: () => ({
          ...backend,
          async write<T>(key: string, value: T) {
            if (inFlight && key === STORAGE_KEYS.provider && !held) {
              held = true;
              started.resolve();
              await release.promise;
            }
            return backend.write(key, value);
          },
        }),
      } as registryModule.SyncBackendImpl);
      options.registerSyncBackendImpl({
        createSyncBackend: () => optionsBackend,
      } as registryModule.SyncBackendImpl);
      const original = {
        keep: { id: "keep", type: "openai" as const, models: [] },
        obsolete: { id: "obsolete", type: "openai" as const, models: [] },
      };
      const next =
        edit === "delete"
          ? { keep: original.keep }
          : {
              ...original,
              later: { id: "later", type: "openai" as const, models: [] },
            };
      try {
        await writer.storage.provider.set(original);
        if (inFlight) {
          flush = writer.flushPendingSyncWrites();
          await started.promise;
        }
        let disabled = false;
        const disable = options
          .setDataSync(SYNC_PREFERENCES.providers, false)
          .then(() => {
            disabled = true;
          });
        if (inFlight) {
          await writer.storage.provider.set(next);
          assert.deepEqual(await writer.storage.provider.get(), next);
          assert.equal(disabled, false);
          assert.equal(
            restoreLocks.pending("openbrowseragent:sync-transition"),
            1,
            "the other context's transition is queued behind this upload",
          );
          release.resolve();
        }
        await disable;
        await writer.storage.provider.set(next);
        await options.setDataSync(SYNC_PREFERENCES.providers, true);
        await Promise.all([
          flush,
          writer.flushPendingSyncWrites(),
          options.flushPendingSyncWrites(),
        ]);
        assert.deepEqual(await backend.read(STORAGE_KEYS.provider), next);
        await options.refreshSyncFromRemote(
          await options.storage.syncDataSettings.get(),
        );
        assert.deepEqual(await writer.storage.provider.get(), next);
      } finally {
        release.resolve();
        await flush;
        restoreLocks();
      }
    });
  }
}

test("independent settings queue cannot undo another context's transition", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const restoreLocks = installLocks();
  const { local } = installBrowser();
  local.data[STORAGE_KEYS.activeSyncBackendId] = BROWSER_SYNC_BACKEND_ID;
  const [writer, options] = contexts;
  for (const context of contexts)
    context.registerSyncBackendImpl({
      createSyncBackend: context.createSyncBackend,
    } as registryModule.SyncBackendImpl);
  const backend = writer.createSyncBackend({
    id: BROWSER_SYNC_BACKEND_ID,
    type: "browser-sync",
    name: "Fixture",
  });
  try {
    await writer.storage.syncDataSettings.set({
      ...DEFAULT_SYNC_DATA_SETTINGS,
      syncProviders: false,
    });
    await options.storage.provider.set({
      local: { id: "local", type: "openai", models: [] },
    });
    await options.setDataSync(SYNC_PREFERENCES.providers, true);
    await options.flushPendingSyncWrites();
    await writer.flushPendingSyncWrites();
    assert.equal(
      (
        await backend.read<typeof DEFAULT_SYNC_DATA_SETTINGS>(
          STORAGE_KEYS.syncDataSettings,
        )
      )?.syncProviders,
      true,
    );
    await writer.refreshSyncFromRemote(
      await writer.storage.syncDataSettings.get(),
    );
    assert.deepEqual(Object.keys(await writer.storage.provider.get()), [
      "local",
    ]);
  } finally {
    restoreLocks();
  }
});

test("independent in-flight upload and backend switch preserve the new backend and later switch back", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const restoreLocks = installLocks();
  const { local } = installBrowser();
  local.data[STORAGE_KEYS.activeSyncBackendId] = BROWSER_SYNC_BACKEND_ID;
  local.data["sync-data-settings:sync-local-cache"] = {
    value: DEFAULT_SYNC_DATA_SETTINGS,
    updatedAt: 1,
    flushedAt: 1,
  };
  const [writer, options] = contexts;
  const secondStorage = browserStorage();
  const firstBackend = writer.createSyncBackend({
    id: BROWSER_SYNC_BACKEND_ID,
    type: "browser-sync",
    name: "First",
  });
  // Route only the real adapter's storage calls to a second synthetic browser
  // sync area. Both backend implementations still use the v2 serializer.
  const originalSync = chrome.storage.sync;
  const secondConfig = {
    id: "second",
    type: "browser-sync" as const,
    name: "Second",
  };
  const secondAdapter = options.createSyncBackend(secondConfig);
  const secondBackend: SyncBackend = {
    ...secondAdapter,
    async read<T>(key: string) {
      chrome.storage.sync = secondStorage.area as typeof chrome.storage.sync;
      try {
        return await secondAdapter.read<T>(key);
      } finally {
        chrome.storage.sync = originalSync;
      }
    },
    async write<T>(key: string, value: T) {
      chrome.storage.sync = secondStorage.area as typeof chrome.storage.sync;
      try {
        return await secondAdapter.write(key, value);
      } finally {
        chrome.storage.sync = originalSync;
      }
    },
  };
  local.data[STORAGE_KEYS.syncBackends] = [firstBackend.config, secondConfig];
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let held = false;
  writer.registerSyncBackendImpl({
    createSyncBackend: () => ({
      ...firstBackend,
      async write<T>(key: string, value: T) {
        if (key === STORAGE_KEYS.provider && !held) {
          held = true;
          started.resolve();
          await release.promise;
        }
        return firstBackend.write(key, value);
      },
    }),
  } as registryModule.SyncBackendImpl);
  options.registerSyncBackendImpl({
    createSyncBackend: (config) =>
      config.id === "second" ? secondBackend : firstBackend,
  } as registryModule.SyncBackendImpl);
  try {
    await writer.storage.provider.set({
      original: { id: "original", type: "openai", models: [] },
    });
    const flush = writer.flushPendingSyncWrites();
    await started.promise;
    let switched = false;
    const switchBackend = options.setActiveSyncBackend("second").then(() => {
      switched = true;
    });
    await writer.storage.provider.set({
      later: { id: "later", type: "openai", models: [] },
    });
    assert.equal(switched, false);
    assert.equal(restoreLocks.pending("openbrowseragent:sync-transition"), 1);
    release.resolve();
    await Promise.all([switchBackend, flush]);
    await writer.flushPendingSyncWrites();
    assert.deepEqual(
      Object.keys((await secondBackend.read<object>(STORAGE_KEYS.provider))!),
      ["later"],
    );
    await options.setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
    await options.flushPendingSyncWrites();
    await options.refreshSyncFromRemote(
      await options.storage.syncDataSettings.get(),
    );
    assert.deepEqual(Object.keys(await options.storage.provider.get()), [
      "later",
    ]);
  } finally {
    release.resolve();
    restoreLocks();
  }
});

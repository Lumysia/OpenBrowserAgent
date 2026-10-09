import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, mock, test } from "node:test";
import { installBrowser } from "./helpers";
import { clearAppStorage } from "../src/shared/storage-debug";
import { clearPendingSyncWrites, storage } from "../src/shared/storage";
import * as backendImpl from "../src/shared/sync-backends-impl";
import { registerSyncBackendImpl } from "../src/shared/sync-backends";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { DEFAULT_SYNC_DATA_SETTINGS } from "../src/shared/sync-data-settings";
import { syncLocalCacheKey } from "../src/shared/storage-sync-local";
import { tinybaseSyncLocalCacheKey } from "../src/shared/sync-tinybase-keys";
import type { SyncBackendConfig } from "../src/shared/types";

const cleanups: Array<() => void> = [];
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
afterEach(async () => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  await settle();
  await clearPendingSyncWrites();
  mock.restoreAll();
  mock.timers.reset();
  registerSyncBackendImpl(backendImpl);
});

const options = { timeout: 3000 };
const provider = { only: { id: "only", type: "openai" as const, models: [] } };
const cache = (value: unknown) => ({ value, updatedAt: 1, flushedAt: 1 });
const providerCacheKey = syncLocalCacheKey(STORAGE_KEYS.provider);
const settingsCacheKey = syncLocalCacheKey(STORAGE_KEYS.syncDataSettings);

async function fixture() {
  mock.timers.enable({ apis: ["setTimeout"] });
  const { local, sync } = installBrowser();
  // Match Chrome's array-key removal overload without changing shared fixtures.
  for (const area of [local, sync])
    mock.method(area.area, "remove", async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys])
        delete area.data[key];
    });
  const config = {
    id: "clear-fixture",
    type: "browser-sync" as const,
    name: "Fixture",
  };
  Object.assign(local.data, {
    [STORAGE_KEYS.activeSyncBackendId]: config.id,
    [STORAGE_KEYS.syncBackends]: [config],
    [STORAGE_KEYS.provider]: provider,
    [providerCacheKey]: cache(provider),
    [settingsCacheKey]: cache(DEFAULT_SYNC_DATA_SETTINGS),
    [tinybaseSyncLocalCacheKey(STORAGE_KEYS.provider)]: "legacy cache",
  });
  const backend = backendImpl.createSyncBackend(config);
  await backend.write(STORAGE_KEYS.provider, provider);
  await backend.write(STORAGE_KEYS.language, "en-US");
  const captured: SyncBackendConfig[] = [];
  registerSyncBackendImpl({
    ...backendImpl,
    createSyncBackend(selected) {
      captured.push(selected);
      return backendImpl.createSyncBackend(selected);
    },
  });

  // Real production locks share one simulated cross-context LockManager. Remote
  // transport must never run inside the local publication critical section.
  const active = new AsyncLocalStorage<string[]>();
  const queues = new Map<string, Promise<unknown>>();
  const previous = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request(name: string, operation: () => Promise<unknown>) {
        const held = active.getStore() || [];
        assert.ok(!held.includes(name), "locks must not be reentrant");
        const next = (queues.get(name) || Promise.resolve())
          .catch(() => undefined)
          .then(() => active.run([...held, name], operation));
        queues.set(name, next);
        return next;
      },
    },
  });
  cleanups.push(() => {
    if (previous) Object.defineProperty(navigator, "locks", previous);
    else Reflect.deleteProperty(navigator, "locks");
  });
  for (const method of ["get", "set", "remove"] as const) {
    const original = sync.area[method].bind(sync.area);
    mock.method(sync.area, method, async (value: never) => {
      assert.ok(
        !active.getStore()?.includes("openbrowseragent:storage-publication"),
      );
      return original(value);
    });
  }
  return { local, sync, config, captured };
}

test(
  "default all/all clear removes local data and the captured configured backend's documents",
  options,
  async () => {
    const { local, sync, config, captured } = await fixture();
    await clearAppStorage();
    assert.deepEqual(local.data, {});
    assert.deepEqual(sync.data, {});
    assert.ok(captured.length > 0);
    for (const selected of captured) assert.deepEqual(selected, config);
  },
);

test(
  "all/all clear with sync disabled removes local data without remote cleanup",
  options,
  async () => {
    const { local, sync, captured } = await fixture();
    local.data[STORAGE_KEYS.activeSyncBackendId] = "local";
    const remote = structuredClone(sync.data);
    await clearAppStorage();
    assert.equal(local.data[STORAGE_KEYS.activeSyncBackendId], undefined);
    assert.equal(local.data[STORAGE_KEYS.provider], undefined);
    assert.equal(local.data[providerCacheKey], undefined);
    assert.deepEqual(sync.data, remote);
    assert.deepEqual(captured, []);
  },
);

for (const scope of ["local", "sync"] as const) {
  test(
    `${scope} provider cleanup preserves the other area and routing settings`,
    options,
    async () => {
      const { local, sync, config } = await fixture();
      const remote = structuredClone(sync.data);
      await clearAppStorage({ scope, targets: ["providers"] });
      assert.equal(local.data[providerCacheKey], undefined);
      assert.equal(local.data[STORAGE_KEYS.activeSyncBackendId], config.id);
      assert.deepEqual(local.data[STORAGE_KEYS.syncBackends], [config]);
      if (scope === "local") {
        assert.equal(local.data[STORAGE_KEYS.provider], undefined);
        assert.deepEqual(sync.data, remote);
      } else {
        assert.deepEqual(local.data[STORAGE_KEYS.provider], provider);
        assert.equal(sync.data.provider, undefined);
        assert.equal(sync.data.language, remote.language);
      }
    },
  );
}

test(
  "clear holds a coherent backend configuration while a route setter waits",
  options,
  async () => {
    const { local, sync, config, captured } = await fixture();
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    cleanups.push(release.resolve);
    const get = local.area.get.bind(local.area);
    mock.method(local.area, "get", async (key: string | null) => {
      if (key === STORAGE_KEYS.syncBackends) {
        started.resolve();
        await release.promise;
      }
      return get(key);
    });
    const clearing = clearAppStorage();
    await started.promise;
    let changed = false;
    const changing = storage.activeSyncBackendId.set("local").then(() => {
      changed = true;
    });
    await settle();
    assert.equal(changed, false);
    assert.equal(local.data[STORAGE_KEYS.activeSyncBackendId], config.id);
    release.resolve();
    await Promise.all([clearing, changing]);
    assert.deepEqual(sync.data, {});
    assert.ok(captured.length > 0);
    assert.ok(captured.every((selected) => selected.id === config.id));
  },
);

test(
  "local settings clear cannot split getter ownership validation and publication",
  options,
  async () => {
    const { local, config } = await fixture();
    delete local.data[providerCacheKey];
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    cleanups.push(release.resolve);
    const set = local.area.set.bind(local.area);
    mock.method(local.area, "set", async (values: Record<string, unknown>) => {
      if (providerCacheKey in values) {
        started.resolve();
        await release.promise;
      }
      await set(values);
    });
    const reading = storage.provider.get();
    await started.promise;
    let done = false;
    const clearing = clearAppStorage({
      scope: "local",
      targets: ["settings"],
    }).then(() => {
      done = true;
    });
    await settle();
    assert.equal(done, false);
    assert.equal(local.data[STORAGE_KEYS.activeSyncBackendId], config.id);
    release.resolve();
    assert.deepEqual(await reading, provider);
    await clearing;
    assert.equal(local.data[STORAGE_KEYS.activeSyncBackendId], undefined);
  },
);

test(
  "clear awaits its queue status write before removing selected settings",
  options,
  async () => {
    const { local } = await fixture();
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    cleanups.push(release.resolve);
    const set = local.area.set.bind(local.area);
    mock.method(local.area, "set", async (values: Record<string, unknown>) => {
      if (STORAGE_KEYS.syncWriteStatus in values) {
        started.resolve();
        await release.promise;
      }
      await set(values);
    });
    let done = false;
    const clearing = clearAppStorage({
      scope: "local",
      targets: ["settings"],
    }).then(() => {
      done = true;
    });
    await started.promise;
    await settle();
    assert.equal(done, false);
    release.resolve();
    await clearing;
    assert.equal(local.data[STORAGE_KEYS.syncWriteStatus], undefined);
  },
);

test(
  "remote cleanup failure waits for other started removals and releases publication for local edits",
  options,
  async () => {
    const { local, sync } = await fixture();
    const failure = new Error("Fixture removal failed");
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    cleanups.push(release.resolve);
    const remove = sync.area.remove.bind(sync.area);
    mock.method(sync.area, "remove", async (key: string) => {
      if (key === STORAGE_KEYS.language) throw failure;
      if (key === STORAGE_KEYS.provider) {
        started.resolve();
        await release.promise;
      }
      await remove(key);
    });
    let completed = false;
    const clearing = clearAppStorage().then(
      () => {
        completed = true;
        return undefined;
      },
      (error: unknown) => {
        completed = true;
        return error;
      },
    );
    await started.promise;
    await settle();
    assert.equal(completed, false);
    await storage.debugLoggingEnabled.set(true);
    assert.equal(local.data[STORAGE_KEYS.debugLoggingEnabled], true);
    release.resolve();
    assert.equal(await clearing, failure);
    assert.equal(sync.data.provider, undefined);
    assert.ok(sync.data.language);
    assert.equal(local.data[STORAGE_KEYS.activeSyncBackendId], undefined);
  },
);

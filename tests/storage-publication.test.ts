import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { installBrowser } from "./helpers";
import {
  clearPendingSyncWrites,
  setActiveSyncBackend,
  setDataSync,
  storage,
} from "../src/shared/storage";
import {
  createSyncBackend,
  decodeSyncBackendChangeValue,
} from "../src/shared/sync-backends-impl";
import { refreshSyncSettingsFromRemote } from "../src/shared/storage-remote-sync";
import { DEFAULT_SYNC_DATA_SETTINGS } from "../src/shared/sync-data-settings";
import { STORAGE_KEYS, SYNC_PREFERENCES } from "../src/shared/storage-keys";
import { syncLocalCacheKey } from "../src/shared/storage-sync-local";

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  clearPendingSyncWrites();
  mock.restoreAll();
  mock.timers.reset();
});

const providers = (...ids: string[]) =>
  Object.fromEntries(
    ids.map((id) => [id, { id, type: "openai" as const, models: [] }]),
  );
const cache = (value: unknown) => ({ value, updatedAt: 1, flushedAt: 1 });
const providerCacheKey = syncLocalCacheKey(STORAGE_KEYS.provider);
const settingsCacheKey = syncLocalCacheKey(STORAGE_KEYS.syncDataSettings);
const disabled = { ...DEFAULT_SYNC_DATA_SETTINGS, syncProviders: false };
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function fixture() {
  mock.timers.enable({ apis: ["setTimeout"] });
  const { local, sync } = installBrowser();
  local.data[STORAGE_KEYS.activeSyncBackendId] = "browser-sync";
  local.data[settingsCacheKey] = cache(DEFAULT_SYNC_DATA_SETTINGS);
  local.data[STORAGE_KEYS.provider] = providers("old");
  const backend = createSyncBackend({
    id: "browser-sync",
    type: "browser-sync",
    name: "Fixture",
  });
  return { local, sync, backend };
}

// Pause a getter after its route precheck, immediately before the cache-lock
// callback. The same LockManager still serializes every production lock name.
function holdNextPublication() {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const previous = Object.getOwnPropertyDescriptor(navigator, "locks");
  const queues = new Map<string, Promise<unknown>>();
  let held = false;
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request(name: string, operation: () => Promise<unknown>) {
        const next = (queues.get(name) ?? Promise.resolve())
          .catch(() => undefined)
          .then(async () => {
            if (name === `openbrowseragent:${providerCacheKey}` && !held) {
              held = true;
              started.resolve();
              await release.promise;
            }
            return operation();
          });
        queues.set(name, next);
        return next;
      },
    },
  });
  cleanups.push(() => {
    release.resolve();
    if (previous) Object.defineProperty(navigator, "locks", previous);
    else Reflect.deleteProperty(navigator, "locks");
  });
  return { started: started.promise, release: release.resolve };
}

for (const authority of ["settings setter", "remote refresh"] as const) {
  test(`late ${authority} makes a getter retry without publishing its obsolete synced fallback`, async () => {
    const { local, backend } = fixture();
    if (authority === "remote refresh")
      await backend.write(STORAGE_KEYS.syncDataSettings, disabled);
    const hold = holdNextPublication();
    const reading = storage.provider.get();
    await hold.started;
    if (authority === "settings setter")
      await storage.syncDataSettings.set(disabled);
    else
      assert.equal(
        (await refreshSyncSettingsFromRemote(DEFAULT_SYNC_DATA_SETTINGS))
          ?.syncProviders,
        false,
      );
    await storage.provider.set(providers("current"));
    hold.release();
    assert.deepEqual(await reading, providers("current"));
    assert.deepEqual(local.data[STORAGE_KEYS.provider], providers("current"));
    assert.equal(local.data[providerCacheKey], undefined);
  });
}

test("late backend change retries against the new backend and current fallback", async () => {
  const { local } = fixture();
  const hold = holdNextPublication();
  const reading = storage.provider.get();
  await hold.started;
  await storage.activeSyncBackendId.set("second");
  local.data[STORAGE_KEYS.provider] = providers("current");
  hold.release();
  assert.deepEqual(await reading, providers("current"));
  assert.deepEqual(
    (local.data[providerCacheKey] as { value: unknown }).value,
    providers("current"),
  );
});

test("publication preserves a superseding pending cache intent", async () => {
  const { local } = fixture();
  const hold = holdNextPublication();
  const reading = storage.provider.get();
  await hold.started;
  const pending = { value: providers("current"), updatedAt: 2 };
  // A persisted edit from another context must remain pending, even if the
  // backend and category still match the getter's original route.
  local.data[providerCacheKey] = pending;
  hold.release();
  assert.deepEqual(await reading, providers("current"));
  assert.deepEqual(local.data[providerCacheKey], pending);
});

test("a remote notification held at publication resolves the current local category", async () => {
  const { local, sync, backend } = fixture();
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {},
  });
  cleanups.push(() => {
    if (previousDocument)
      Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  type Listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => unknown;
  const listeners = new Set<Listener>();
  Object.assign(chrome.storage, {
    onChanged: {
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
    },
  });
  Object.assign(chrome, {
    runtime: {
      sendMessage: async (message: {
        operation: string;
        backendConfig: typeof backend.config;
        key: string;
        value: unknown;
      }) => {
        assert.equal(message.operation, "decodeChange");
        return {
          ok: true,
          value: await decodeSyncBackendChangeValue(
            message.backendConfig,
            message.key,
            message.value,
          ),
        };
      },
    },
  });
  await backend.write(STORAGE_KEYS.provider, providers("remote"));
  const before = cache(providers("before"));
  local.data[providerCacheKey] = before;
  const events: unknown[] = [];
  cleanups.push(storage.provider.watch((next) => events.push(next)));
  await settle();
  const hold = holdNextPublication();
  await Promise.all(
    [...listeners].map((listener) =>
      listener({ provider: { newValue: sync.data.provider } }, "sync"),
    ),
  );
  await hold.started;
  await storage.syncDataSettings.set(disabled);
  await storage.provider.set(providers("current"));
  hold.release();
  await settle();
  assert.deepEqual(events, [providers("current")]);
  assert.deepEqual(local.data[providerCacheKey], before);
});

for (const authority of [
  "settings setter",
  "settings removal",
  "backend setter",
  "category transition",
  "backend transition",
  "remote refresh",
] as const) {
  test(`${authority} cannot change route between ownership validation and cache storage`, async () => {
    const { local, backend } = fixture();
    if (authority === "remote refresh")
      await backend.write(STORAGE_KEYS.syncDataSettings, disabled);
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    cleanups.push(release.resolve);
    const set = local.area.set.bind(local.area);
    let held = false;
    mock.method(local.area, "set", async (values: Record<string, unknown>) => {
      if (providerCacheKey in values && !held) {
        held = true;
        started.resolve();
        await release.promise;
      }
      await set(values);
    });
    const reading = storage.provider.get();
    await started.promise;
    const change = () => {
      switch (authority) {
        case "settings setter":
          return storage.syncDataSettings.set(disabled);
        case "settings removal":
          return storage.syncDataSettings.remove();
        case "backend setter":
          return storage.activeSyncBackendId.set("local");
        case "category transition":
          return setDataSync(SYNC_PREFERENCES.providers, false);
        case "backend transition":
          return setActiveSyncBackend("local");
        case "remote refresh":
          return refreshSyncSettingsFromRemote(DEFAULT_SYNC_DATA_SETTINGS);
      }
    };
    let changed = false;
    const changing = change().then(() => {
      changed = true;
    });
    await settle();
    assert.equal(changed, false);
    assert.equal(local.data[STORAGE_KEYS.activeSyncBackendId], "browser-sync");
    assert.deepEqual(
      local.data[settingsCacheKey],
      cache(DEFAULT_SYNC_DATA_SETTINGS),
    );
    release.resolve();
    assert.deepEqual(await reading, providers("old"));
    await changing;
    assert.equal(changed, true);
  });
}

test("switchable update can resolve and publish an uncached value under the mutation lock", async () => {
  const { local } = fixture();
  const next = await storage.provider.update((current) => ({
    ...current,
    ...providers("added"),
  }));
  assert.deepEqual(next, providers("old", "added"));
  assert.deepEqual(await storage.provider.get(), next);
  assert.equal(
    (local.data[providerCacheKey] as { flushedAt?: number }).flushedAt,
    undefined,
  );
});

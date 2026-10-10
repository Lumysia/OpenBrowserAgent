import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { installBrowser, holdMethod } from "./helpers";
import {
  storage,
  setActiveSyncBackend,
  flushPendingSyncWrites,
  clearPendingSyncWrites,
} from "../src/shared/storage";
import { createSyncBackend } from "../src/shared/sync-backends-impl";
import { refreshSyncFromRemote } from "../src/shared/storage-remote-sync";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import { DEFAULT_SYNC_DATA_SETTINGS } from "../src/shared/sync-data-settings";
import { syncLocalCacheKey } from "../src/shared/storage-sync-local";

const unwatchers: Array<() => void> = [];
afterEach(() => {
  unwatchers.splice(0).forEach((unwatch) => unwatch());
  clearPendingSyncWrites();
  mock.restoreAll();
  mock.timers.reset();
});

const cache = (value: unknown) => ({ value, updatedAt: 1, flushedAt: 1 });
const providers = (...ids: string[]) =>
  Object.fromEntries(
    ids.map((id) => [id, { id, type: "openai" as const, models: [] }]),
  );
const preferences = {
  ...DEFAULT_PREFERENCES,
  colorScheme: "dark" as const,
  autoRetry: false,
};

function fixture(synced = true) {
  mock.timers.enable({ apis: ["setTimeout"] });
  const { local, sync } = installBrowser();
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
  local.data["active-sync-backend-id"] = synced ? "browser-sync" : "local";
  local.data[
    synced ? "sync-data-settings:sync-local-cache" : "sync-data-settings"
  ] = synced ? cache(DEFAULT_SYNC_DATA_SETTINGS) : DEFAULT_SYNC_DATA_SETTINGS;
  return {
    local,
    sync,
    async emit(changes: Record<string, chrome.storage.StorageChange>) {
      // The helper emulates browser event delivery only. Every read, mutation,
      // activation, refresh and backend operation uses production code/TinyBase.
      await Promise.all(
        [...listeners].map((listener) => listener(changes, "local")),
      );
    },
  };
}

function watch<T>(item: {
  watch(callback: (next: T, previous: T) => void): () => void;
}) {
  const events: T[] = [];
  unwatchers.push(item.watch((next) => events.push(next)));
  return events;
}

for (const synced of [false, true]) {
  test(`${synced ? "synced" : "local"} ordinary item watch preserves defined falsy values and agrees with get after removal`, async () => {
    const { local, emit } = fixture(synced);
    const item = synced ? storage.language : storage.debugLoggingEnabled;
    const key = synced ? syncLocalCacheKey(item.key) : item.key;
    const empty = synced ? "" : false;
    const before = synced ? cache("fr-FR") : true;
    const next = synced ? cache(empty) : empty;
    local.data[key] = before;
    const events = watch<string | boolean>(item);
    local.data[key] = next;
    await emit({ [key]: { oldValue: before, newValue: next } });
    assert.equal(events.at(-1), empty);
    delete local.data[key];
    const writes = local.writes.length;
    await emit({ [key]: { oldValue: next } });
    assert.equal(
      local.writes.length,
      writes,
      "notification resolution must not publish a cache",
    );
    assert.equal(events.at(-1), await item.get());
  });
}

for (const key of ["preferences", "provider"] as const) {
  test(`${key} cache removal resolves retained fallback through the getter policy`, async () => {
    const { local, sync, emit } = fixture();
    // Deliberately incomplete preferences verify fallback normalization too.
    const fallback =
      key === "preferences"
        ? { colorScheme: "dark", autoRetry: false }
        : providers("local");
    const previous = cache(
      key === "preferences" ? DEFAULT_PREFERENCES : providers("remote"),
    );
    local.data[key] = fallback;
    const cacheKey = syncLocalCacheKey(key);
    local.data[cacheKey] = previous;
    const events = watch<unknown>(storage[key]);
    delete local.data[cacheKey];
    const writes = local.writes.length;
    await emit({ [cacheKey]: { oldValue: previous } });
    assert.equal(local.writes.length, writes);
    assert.deepEqual(sync.data, {});
    assert.deepEqual(
      events.at(-1),
      key === "preferences" ? preferences : fallback,
    );
    assert.deepEqual(events.at(-1), await storage[key].get());
  });

  test(`${key} explicit pending removal suppresses fallback until settled without consuming its intent`, async () => {
    const { local, emit } = fixture();
    const fallback = key === "preferences" ? preferences : providers("local");
    local.data[key] = fallback;
    local.data[syncLocalCacheKey(key)] = cache(fallback);
    const events = watch<unknown>(storage[key]);
    await storage[key].remove();
    const pending = structuredClone(local.data[syncLocalCacheKey(key)]);
    await emit({
      [syncLocalCacheKey(key)]: {
        oldValue: cache(fallback),
        newValue: pending,
      },
    });
    assert.deepEqual(
      events.at(-1),
      key === "preferences" ? DEFAULT_PREFERENCES : {},
    );
    assert.deepEqual(events.at(-1), await storage[key].get());
    assert.deepEqual(local.data[syncLocalCacheKey(key)], pending);
    await flushPendingSyncWrites();
    await emit({
      [syncLocalCacheKey(key)]: {
        oldValue: pending,
        newValue: local.data[syncLocalCacheKey(key)],
      },
    });
    assert.deepEqual(events.at(-1), await storage[key].get());
  });
}

test("public activation and real remote removal/refresh preserve watcher/getter fallback agreement", async () => {
  const { local, emit } = fixture(false);
  await storage.preferences.set(preferences);
  await storage.provider.set(providers("local"));
  const preferenceEvents = watch(storage.preferences);
  const providerEvents = watch(storage.provider);
  await setActiveSyncBackend("browser-sync");
  await emit({
    "active-sync-backend-id": { oldValue: "local", newValue: "browser-sync" },
  });
  assert.deepEqual(preferenceEvents.at(-1), await storage.preferences.get());
  assert.deepEqual(providerEvents.at(-1), await storage.provider.get());
  const previousPreferences = structuredClone(
    local.data["preferences:sync-local-cache"],
  );
  const previousProviders = structuredClone(
    local.data["provider:sync-local-cache"],
  );
  const backend = createSyncBackend({
    id: "browser-sync",
    type: "browser-sync",
    name: "Fixture",
  });
  await backend.remove("preferences");
  await backend.remove("provider");
  await refreshSyncFromRemote(await storage.syncDataSettings.get());
  assert.equal(local.data["preferences:sync-local-cache"], undefined);
  assert.equal(local.data["provider:sync-local-cache"], undefined);
  await emit({
    "preferences:sync-local-cache": { oldValue: previousPreferences },
    "provider:sync-local-cache": { oldValue: previousProviders },
  });
  assert.deepEqual(preferenceEvents.at(-1), preferences);
  assert.deepEqual(providerEvents.at(-1), providers("local"));
  assert.deepEqual(preferenceEvents.at(-1), await storage.preferences.get());
  assert.deepEqual(providerEvents.at(-1), await storage.provider.get());
});

test("normalized defined preference notifications match reads for local and pending synced values", async () => {
  const { local, emit } = fixture(false);
  const events = watch(storage.preferences);
  const partial = {
    colorScheme: "dark",
    autoRetry: false,
    syncProviders: true,
  };
  local.data.preferences = partial;
  await emit({ preferences: { newValue: partial } });
  assert.deepEqual(events.at(-1), preferences);
  assert.deepEqual(events.at(-1), await storage.preferences.get());
  local.data["active-sync-backend-id"] = "browser-sync";
  local.data["preferences:sync-local-cache"] = { value: partial, updatedAt: 2 };
  await emit({
    "preferences:sync-local-cache": {
      newValue: local.data["preferences:sync-local-cache"],
    },
  });
  assert.deepEqual(events.at(-1), preferences);
  assert.deepEqual(events.at(-1), await storage.preferences.get());
  assert.equal(
    (local.data["preferences:sync-local-cache"] as { flushedAt?: number })
      .flushedAt,
    undefined,
  );
});

for (const key of ["preferences", "provider"] as const) {
  for (const action of ["newer edit", "unsubscribe"] as const) {
    test(`${key} delayed removal fallback cannot outlive ${action}`, async () => {
      const { local, emit } = fixture();
      local.data[key] =
        key === "preferences" ? preferences : providers("fallback");
      const events = watch<unknown>(storage[key]);
      const hold = holdMethod(
        local.area,
        "get",
        (requested) => requested === key,
        true,
      );
      const removing = emit({
        [syncLocalCacheKey(key)]: { oldValue: cache({}) },
      });
      await hold.started;
      if (action === "unsubscribe")
        unwatchers.splice(0).forEach((unwatch) => unwatch());
      else {
        if (key === "preferences")
          await storage.preferences.set({
            ...preferences,
            colorScheme: "light",
          });
        else await storage.provider.set(providers("newer"));
        await emit({
          [syncLocalCacheKey(key)]: {
            oldValue: cache({}),
            newValue: local.data[syncLocalCacheKey(key)],
          },
        });
      }
      hold.release();
      await removing;
      if (action === "unsubscribe") assert.deepEqual(events, []);
      else {
        assert.equal(events.length, 1);
        assert.deepEqual(events[0], await storage[key].get());
        assert.equal(
          (local.data[syncLocalCacheKey(key)] as { flushedAt?: number })
            .flushedAt,
          undefined,
        );
      }
    });
  }
}

test("a getter cannot publish an old fallback over a newer pending edit", async () => {
  const { local } = fixture();
  local.data.provider = providers("fallback");
  const hold = holdMethod(
    local.area,
    "get",
    (requested) => requested === "provider",
    true,
  );
  const reading = storage.provider.get();
  await hold.started;
  await storage.provider.set(providers("newer"));
  const pending = structuredClone(local.data["provider:sync-local-cache"]);
  hold.release();
  assert.deepEqual(await reading, providers("newer"));
  assert.deepEqual(local.data["provider:sync-local-cache"], pending);
});

test("the previous value of an explicit removal is its effective default, not a retained fallback", async () => {
  const { local, emit } = fixture();
  local.data.preferences = preferences;
  local.data["preferences:sync-local-cache"] = cache(preferences);
  await storage.preferences.remove();
  const pending = structuredClone(local.data["preferences:sync-local-cache"]);
  const events: unknown[] = [];
  unwatchers.push(
    storage.preferences.watch((next, previous) =>
      events.push([next, previous]),
    ),
  );
  await storage.preferences.set(preferences);
  await emit({
    "preferences:sync-local-cache": {
      oldValue: pending,
      newValue: local.data["preferences:sync-local-cache"],
    },
  });
  assert.deepEqual(events, [[preferences, DEFAULT_PREFERENCES]]);
});

test("a delayed fallback follows a category route change without publishing the old snapshot", async () => {
  const { local, emit } = fixture();
  local.data.provider = providers("old-fallback");
  const events = watch(storage.provider);
  const hold = holdMethod(
    local.area,
    "get",
    (requested) => requested === "provider",
    true,
  );
  const reading = storage.provider.get();
  await hold.started;
  const previous = local.data["sync-data-settings:sync-local-cache"];
  await storage.syncDataSettings.set({
    ...DEFAULT_SYNC_DATA_SETTINGS,
    syncProviders: false,
  });
  await storage.provider.set(providers("new-local"));
  await emit({
    "sync-data-settings:sync-local-cache": {
      oldValue: previous,
      newValue: local.data["sync-data-settings:sync-local-cache"],
    },
  });
  hold.release();
  assert.deepEqual(await reading, providers("new-local"));
  assert.deepEqual(events.at(-1), providers("new-local"));
  assert.equal(local.data["provider:sync-local-cache"], undefined);
});

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { browserStorage, installBrowser } from "./helpers";
import { createSyncBackend } from "../src/shared/sync-backends-impl";
import {
  BROWSER_SYNC_BACKEND_ID,
  NO_SYNC_BACKEND_ID,
  registerSyncBackendImpl,
  type SyncBackend,
  type SyncBackendImpl,
} from "../src/shared/sync-backends";
import {
  storage,
  setDataSync,
  setActiveSyncBackend,
  clearPendingSyncWrites,
} from "../src/shared/storage";
import { DEFAULT_SYNC_DATA_SETTINGS } from "../src/shared/sync-data-settings";
import { STORAGE_KEYS, SYNC_PREFERENCES } from "../src/shared/storage-keys";
import { syncLocalCacheKey } from "../src/shared/storage-sync-cache";
import type { Chat } from "../src/shared/types";

afterEach(() => clearPendingSyncWrites());

for (const transitionKind of ["category", "backend"] as const) {
  for (const category of ["providers", "chats"] as const) {
    for (const edit of ["none", "add", "delete"] as const) {
      test(`sync v2 ${transitionKind} activation preserves cloud ${category} with local ${edit}`, async () => {
        const remoteStorage = browserStorage();
        const { local } = installBrowser(browserStorage(), remoteStorage);
        const backend = createSyncBackend({
          id: BROWSER_SYNC_BACKEND_ID,
          type: "browser-sync",
          name: "Fixture",
        });
        const key =
          category === "providers" ? STORAGE_KEYS.provider : STORAGE_KEYS.chats;
        const makeValue = (ids: string[]) =>
          category === "providers"
            ? Object.fromEntries(
                ids.map((id) => [id, { id, type: "openai", models: [] }]),
              )
            : ids.map((id) => ({
                id,
                title: id,
                createdAt: 1,
                updatedAt: 1,
                messages: [
                  {
                    id: `${id}-message`,
                    role: "user",
                    content: id,
                    createdAt: 1,
                  },
                ],
              }));
        await backend.write(key, makeValue(["cloud"]));
        const settings = {
          ...DEFAULT_SYNC_DATA_SETTINGS,
          syncProviders: false,
          syncChats: false,
        };
        settings[SYNC_PREFERENCES[category]] = transitionKind === "backend";
        local.data[STORAGE_KEYS.syncDataSettings] = settings;
        local.data[STORAGE_KEYS.activeSyncBackendId] =
          transitionKind === "category"
            ? BROWSER_SYNC_BACKEND_ID
            : NO_SYNC_BACKEND_ID;
        local.data[syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)] = {
          value: settings,
          updatedAt: 1,
          flushedAt: 1,
        };
        local.data[key] = makeValue(["local"]);
        const started = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        let held = false;
        const wrapped = {
          ...backend,
          async write<T>(requested: string, value: T) {
            const result = await backend.write(requested, value);
            if (requested === key && edit !== "none" && !held) {
              held = true;
              started.resolve();
              await release.promise;
            }
            return result;
          },
        } satisfies SyncBackend;
        registerSyncBackendImpl({
          createSyncBackend: () => wrapped,
        } as SyncBackendImpl);
        const transition =
          transitionKind === "category"
            ? setDataSync(SYNC_PREFERENCES[category], true)
            : setActiveSyncBackend(BROWSER_SYNC_BACKEND_ID);
        if (edit !== "none") {
          await started.promise;
          const next = makeValue(edit === "add" ? ["local", "later"] : []);
          if (category === "providers")
            await storage.provider.set(
              next as Awaited<ReturnType<typeof storage.provider.get>>,
            );
          else
            await storage.chats.set(
              next as Awaited<ReturnType<typeof storage.chats.get>>,
            );
          release.resolve();
        }
        await transition;
        const active =
          category === "providers"
            ? await storage.provider.get()
            : await storage.chats.get();
        const ids = Array.isArray(active)
          ? active.map((chat) => chat.id)
          : Object.keys(active);
        assert.deepEqual(
          ids.sort(),
          edit === "delete"
            ? ["cloud"]
            : edit === "add"
              ? ["cloud", "later", "local"]
              : ["cloud", "local"],
        );
        const synced = await backend.read(key);
        assert.deepEqual(
          Array.isArray(synced)
            ? synced.map((chat) => chat.id).sort()
            : Object.keys(synced as object).sort(),
          ids,
        );
      });
    }
  }
}

test("sync v2 retry preserves cloud messages while applying a newer streamed message to the same chat", async () => {
  const { local } = installBrowser();
  const backend = createSyncBackend({
    id: BROWSER_SYNC_BACKEND_ID,
    type: "browser-sync",
    name: "Fixture",
  });
  const message = (id: string): Chat["messages"][number] => ({
    id,
    role: "user",
    content: id,
    createdAt: 1,
  });
  const chat = (messages: Chat["messages"]): Chat => ({
    id: "shared-chat",
    title: "Shared",
    createdAt: 1,
    updatedAt: 1,
    messages,
  });
  await backend.write(STORAGE_KEYS.chats, [chat([message("cloud-message")])]);
  local.data[STORAGE_KEYS.activeSyncBackendId] = BROWSER_SYNC_BACKEND_ID;
  local.data[syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)] = {
    value: { ...DEFAULT_SYNC_DATA_SETTINGS, syncChats: false },
    updatedAt: 1,
    flushedAt: 1,
  };
  await storage.chats.set([chat([message("local-message")])]);
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let held = false;
  registerSyncBackendImpl({
    createSyncBackend: () => ({
      ...backend,
      async write<T>(key: string, value: T) {
        const result = await backend.write(key, value);
        if (key === STORAGE_KEYS.chats && !held) {
          held = true;
          started.resolve();
          await release.promise;
        }
        return result;
      },
    }),
  } as SyncBackendImpl);
  const transition = setDataSync(SYNC_PREFERENCES.chats, true);
  await started.promise;
  await storage.chats.set([
    chat([message("local-message"), message("streamed-message")]),
  ]);
  release.resolve();
  await transition;
  assert.deepEqual(
    (await storage.chats.get())[0].messages.map((message) => message.id).sort(),
    ["cloud-message", "local-message", "streamed-message"],
  );
});

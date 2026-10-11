import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { installBrowser } from "./helpers";
import { createSyncBackend } from "../src/shared/sync-backends-impl";
import { BROWSER_SYNC_BACKEND_ID } from "../src/shared/sync-backends";
import {
  storage,
  setDataSync,
  setActiveSyncBackend,
  flushPendingSyncWrites,
  clearPendingSyncWrites,
  STORAGE_KEYS,
  SYNC_PREFERENCES,
} from "../src/shared/storage";
import { clearAppStorage } from "../src/shared/storage-debug";
import type { Chat, ProviderState } from "../src/shared/types";

afterEach(() => clearPendingSyncWrites());

const browserSync = () =>
  createSyncBackend({
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

test("a failed sync write stays visible in the sync status", async () => {
  const { local } = installBrowser();
  local.data[STORAGE_KEYS.activeSyncBackendId] = BROWSER_SYNC_BACKEND_ID;
  await storage.provider.set({
    big: { id: "big", type: "openai", apiKey: "x".repeat(9000), models: [] },
  } as unknown as ProviderState);
  await flushPendingSyncWrites();
  const status = await storage.syncWriteStatus.get();
  assert.equal(status.pendingCount, 0);
  assert.match(status.lastError || "", /per-item limit/);
});

test("clearing local data removes every synced replica", async () => {
  const { local } = installBrowser();
  local.data[STORAGE_KEYS.activeSyncBackendId] = BROWSER_SYNC_BACKEND_ID;
  await storage.provider.set(providers("p"));
  await flushPendingSyncWrites();
  assert.ok(
    Object.keys(local.data).some((k) => k.startsWith("tinybase-sync-doc:")),
  );

  await clearAppStorage({ scope: "local", targets: ["all"] });
  assert.deepEqual(
    Object.keys(local.data).filter((k) => k.startsWith("tinybase-sync-doc:")),
    [],
  );
  assert.ok(!JSON.stringify(local.data).includes("p-key"));
});

import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { storage } from "../src/shared/storage";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { NO_SYNC_BACKEND_ID } from "../src/shared/sync-backends";
import { installBrowser } from "./helpers";

afterEach(() => mock.restoreAll());

for (const [key, edit] of [
  ["provider", { fixture: { id: "fixture", type: "openai", models: [] } }],
  [
    "chats",
    [
      {
        id: "chat",
        title: "New chat",
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: "user",
            role: "user",
            content: "Keep this message",
            createdAt: 1,
          },
        ],
      },
    ],
  ],
  ["language", "fr-FR"],
  ["preferences", { colorScheme: "dark" }],
] as const) {
  test(`initial ${key} read cannot overwrite an edit made while it was loading`, async () => {
    const { local } = installBrowser();
    local.data[STORAGE_KEYS.activeSyncBackendId] = NO_SYNC_BACKEND_ID;
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const get = local.area.get.bind(local.area);
    let delayed = false;
    mock.method(local.area, "get", async (requested) => {
      const result = await get(requested);
      if (requested === key && !delayed) {
        delayed = true;
        started.resolve();
        await release.promise;
      }
      return result;
    });
    const initial = storage[key].get();
    await started.promise;
    await local.area.set({ [key]: edit });
    release.resolve();
    await initial;
    assert.deepEqual(local.data[key], edit);
  });
}

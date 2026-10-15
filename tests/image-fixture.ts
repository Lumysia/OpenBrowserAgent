import { mock } from "node:test";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import { storage } from "../src/shared/storage";
import { NO_SYNC_BACKEND_ID } from "../src/shared/sync-backends";
import { DEFAULT_SYNC_STATUS } from "../src/shared/sync/state";

export function imageModelFixture() {
  // Sync off: the fixture provider's missing key is not a locked one.
  mock.method(
    storage.activeSyncBackendId,
    "get",
    async () => NO_SYNC_BACKEND_ID,
  );
  mock.method(storage.syncStatus, "get", async () => DEFAULT_SYNC_STATUS);
  mock.method(storage.preferences, "get", async () => ({
    ...DEFAULT_PREFERENCES,
    selectedImageModelId: "fixture-image",
  }));
  mock.method(storage.provider, "get", async () => ({
    fixture: {
      id: "fixture",
      type: "openai" as const,
      baseUrl: "https://example.test/v1",
      consent: { host: "example.test", grantedAt: 1 },
      imageModels: [{ id: "fixture-image", name: "fixture-image" }],
    },
  }));
}

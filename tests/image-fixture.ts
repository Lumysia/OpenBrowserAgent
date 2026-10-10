import { mock } from "node:test";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import { storage } from "../src/shared/storage";

export function imageModelFixture() {
  mock.method(storage.preferences, "get", async () => ({
    ...DEFAULT_PREFERENCES,
    selectedImageModelId: "fixture-image",
  }));
  mock.method(storage.provider, "get", async () => ({
    fixture: {
      id: "fixture",
      type: "openai" as const,
      baseUrl: "https://example.test/v1",
      imageModels: [{ id: "fixture-image", name: "fixture-image" }],
    },
  }));
}

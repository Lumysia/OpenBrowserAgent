import assert from "node:assert/strict";
import { test } from "node:test";
import { generateImageTool } from "../src/background/tools/images";
import type { ToolSetup } from "../src/background/tools/types";
import { DEFAULT_AGENT } from "../src/shared/agents";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import { storage } from "../src/shared/storage";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { runStorageMigrations } from "../src/shared/storage-migrations";
import type { Preferences, ProviderState } from "../src/shared/types";
import { eventListeners, memoryArea, swapChrome } from "./fake-chrome";

const PROVIDERS: ProviderState = {
  p: {
    type: "openai",
    models: [
      { id: "chat-a", name: "chat-a" },
      { id: "chat-b", name: "chat-b" },
    ],
    imageModels: [{ id: "image-x", name: "image-x" }],
  },
};

// Preferences as 0.2.0-beta.16 stored them, after the migrations.
async function migrated(stored: Record<string, unknown>) {
  const local = memoryArea();
  local.data[STORAGE_KEYS.provider] = PROVIDERS;
  local.data[STORAGE_KEYS.preferences] = stored;
  const restore = swapChrome({
    storage: { local, onChanged: eventListeners() },
  });
  try {
    await runStorageMigrations(false);
    return {
      raw: local.data[STORAGE_KEYS.preferences] as Record<string, unknown>,
      preferences: await storage.preferences.get(),
    };
  } finally {
    restore();
  }
}

test("image generation on without a model keeps using the chat's model", async () => {
  const { raw, preferences } = await migrated({
    imageGenerationEnabled: true,
    selectedModelId: "chat-b",
  });
  assert.equal(preferences.selectedImageModelId, "chat-b");
  assert.equal(preferences.selectedModelId, "chat-b");
  assert.ok(!("imageGenerationEnabled" in raw));
  // No chat model chosen either: the first configured model was used.
  const first = await migrated({ imageGenerationEnabled: true });
  assert.equal(first.preferences.selectedImageModelId, "chat-a");
});

test("image generation on with a model keeps that model", async () => {
  const { raw } = await migrated({
    imageGenerationEnabled: true,
    selectedModelId: "chat-b",
    selectedImageModelId: "image-x",
  });
  assert.equal(raw.selectedImageModelId, "image-x");
  assert.ok(!("imageGenerationEnabled" in raw));
  // A model no longer configured fell back to the chat's model.
  const gone = await migrated({
    imageGenerationEnabled: true,
    selectedModelId: "chat-b",
    selectedImageModelId: "removed",
  });
  assert.equal(gone.raw.selectedImageModelId, "chat-b");
});

test("image generation off clears the model choice", async () => {
  const { raw } = await migrated({
    imageGenerationEnabled: false,
    selectedModelId: "chat-b",
    selectedImageModelId: "image-x",
    autoScroll: false,
  });
  assert.equal(raw.selectedImageModelId, undefined);
  assert.ok(!("imageGenerationEnabled" in raw));
  assert.equal(raw.selectedModelId, "chat-b");
  assert.equal(raw.autoScroll, false);
});

test("preferences without the old switch are left as they are", async () => {
  const stored = { selectedModelId: "chat-b", selectedImageModelId: "image-x" };
  const { raw } = await migrated({ ...stored });
  assert.deepEqual(raw, stored);
});

test("the image tool exists only while a configured image model is chosen", () => {
  const setup = (preferences: Partial<Preferences>): ToolSetup => ({
    agent: DEFAULT_AGENT,
    mcpServers: [],
    preferences: { ...DEFAULT_PREFERENCES, ...preferences },
    providers: PROVIDERS,
    depth: 0,
  });
  const available = (preferences: Partial<Preferences>) =>
    generateImageTool.available!(setup(preferences));
  assert.equal(available({}), false);
  assert.equal(available({ selectedModelId: "chat-a" }), false);
  assert.equal(available({ selectedImageModelId: "removed" }), false);
  assert.equal(available({ selectedImageModelId: "image-x" }), true);
  assert.equal(available({ selectedImageModelId: "chat-b" }), true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseHelperModel,
  chooseImageModel,
  namedModel,
} from "../src/shared/model-choice";
import {
  forgetRemovedModels,
  MODEL_ROLES,
  roleModels,
} from "../src/shared/model-roles";
import { storage } from "../src/shared/storage";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import type { Preferences, ProviderState } from "../src/shared/types";
import { eventListeners, memoryArea, swapChrome } from "./fake-chrome";

const PROVIDERS: ProviderState = {
  a: {
    type: "openai",
    models: [{ id: "a:chat", name: "chat" }],
    imageModels: [{ id: "a:image", name: "image" }],
  },
  b: { type: "openai", models: [{ id: "b:other", name: "other" }] },
};

const role = (id: string) => MODEL_ROLES.find((item) => item.id === id)!;

test("each role lists the models it can use: images also the image models", () => {
  assert.deepEqual(
    roleModels(role("helper"), PROVIDERS).map((model) => model.id),
    ["a:chat", "b:other"],
  );
  assert.deepEqual(
    roleModels(role("images"), PROVIDERS).map((model) => model.id),
    ["a:image", "a:chat", "b:other"],
  );
});

test("the choice the Models table shows is the model the feature uses", () => {
  const images = roleModels(role("images"), PROVIDERS);
  const chat = roleModels(role("helper"), PROVIDERS);
  for (const modelId of ["a:image", "a:chat", "chat", "image", "gone", ""]) {
    assert.equal(
      namedModel(images, modelId),
      chooseImageModel(PROVIDERS, { selectedImageModelId: modelId })?.model,
      modelId,
    );
    assert.equal(
      namedModel(chat, modelId),
      chooseHelperModel(PROVIDERS, modelId)?.model,
      modelId,
    );
  }
});

test("removing a model unsets each choice of it, and only those", () => {
  const preferences: Preferences = {
    selectedModelId: "a:chat",
    helperModelId: "b:other",
    smartBar: { modelId: "chat" } as Preferences["smartBar"],
    selectedImageModelId: "a:image",
  };
  const { a: _a, ...withoutA } = PROVIDERS;
  const next = forgetRemovedModels(preferences, PROVIDERS, withoutA);
  assert.equal(next.selectedModelId, undefined);
  assert.equal(next.helperModelId, "b:other");
  assert.equal(next.smartBar?.modelId, "");
  assert.equal(next.selectedImageModelId, undefined);
  // A choice naming no model before stays as it is (a provider may still
  // arrive through sync); nothing removed changes nothing.
  const stale = { selectedImageModelId: "elsewhere" };
  assert.equal(forgetRemovedModels(stale, PROVIDERS, withoutA), stale);
  assert.equal(
    forgetRemovedModels(preferences, PROVIDERS, PROVIDERS),
    preferences,
  );
});

test("a model still named by another provider keeps its choice", () => {
  const twice: ProviderState = {
    ...PROVIDERS,
    c: { type: "openai", models: [{ id: "c:chat", name: "chat" }] },
  };
  const { a: _a, ...withoutA } = twice;
  const preferences = { helperModelId: "chat" };
  assert.equal(forgetRemovedModels(preferences, twice, withoutA), preferences);
});

test("a provider edit that removes the chosen image model unsets it in storage", async () => {
  const local = memoryArea();
  local.data[STORAGE_KEYS.provider] = PROVIDERS;
  local.data[STORAGE_KEYS.preferences] = {
    selectedModelId: "b:other",
    selectedImageModelId: "a:image",
  };
  const restore = swapChrome({
    storage: { local, onChanged: eventListeners() },
  });
  try {
    await storage.provider.update((providers) => ({
      ...providers,
      a: { ...providers.a, imageModels: [] },
    }));
    const preferences = await storage.preferences.get();
    assert.equal(preferences.selectedImageModelId, undefined);
    assert.equal(preferences.selectedModelId, "b:other");
  } finally {
    restore();
  }
});

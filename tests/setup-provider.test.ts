import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProviderConfig,
  providerUntouched,
} from "../src/shared/provider-instances";
import { releaseSetupProvider } from "../src/shared/setup-progress";
import {
  SETUP_PATH_STEPS,
  setupHoldsProvider,
} from "../src/shared/setup-steps";
import { storage } from "../src/shared/storage";
import type { ProviderConfig } from "../src/shared/types";
import { eventListeners, memoryArea, swapChrome } from "./fake-chrome";

// The AI provider setup adds when a kind is picked, and what happens to it
// when setup goes elsewhere.

const fresh = (extra: ProviderConfig = {}) => ({
  ...createProviderConfig("openai", {}),
  ...extra,
});

test("a provider is untouched until anything is filled in", () => {
  assert.equal(providerUntouched("openai", fresh()), true);
  // As stored before normalizing, and with blanks left by a cleared field.
  assert.equal(
    providerUntouched("openai", { id: "openai", type: "openai" }),
    true,
  );
  assert.equal(
    providerUntouched("openai", fresh({ apiKey: " ", label: "" })),
    true,
  );
  // Another id of the same kind (a second one added).
  const second = createProviderConfig("openai", { openai: fresh() });
  assert.equal(providerUntouched(second.id, second), true);

  const filled: ProviderConfig[] = [
    { apiKey: "sk-test" },
    { models: [{ id: "openai:gpt", name: "gpt" }] },
    { imageModels: [{ id: "openai:image", name: "image" }] },
    { baseUrl: "https://example.test/v1" },
    { label: "Work" },
    { consent: { host: "api.openai.com", grantedAt: 1 } },
  ];
  for (const extra of filled)
    assert.equal(
      providerUntouched("openai", fresh(extra)),
      false,
      JSON.stringify(extra),
    );
});

test("setup holds its provider at that step and past it on the new path", () => {
  const holds = (path: "new" | "returning" | undefined) =>
    SETUP_PATH_STEPS[path ?? "new"].filter((step) =>
      setupHoldsProvider({ step, path }),
    );
  assert.deepEqual(holds("new"), ["provider", "pages", "done"]);
  assert.deepEqual(holds(undefined), ["provider", "pages", "done"]);
  assert.deepEqual(holds("returning"), []);
});

test("releasing setup's provider deletes it only while untouched", async () => {
  const restore = swapChrome({
    storage: { local: memoryArea(), onChanged: eventListeners() },
  });
  try {
    const synced = fresh({ id: "synced", apiKey: "sk-synced" });
    await storage.provider.update(() => ({
      openai: fresh(),
      synced,
    }));
    assert.equal(await releaseSetupProvider("openai"), true);
    assert.deepEqual(Object.keys(await storage.provider.get()), ["synced"]);

    // Filled in: it stays.
    assert.equal(await releaseSetupProvider("synced"), false);
    assert.deepEqual(Object.keys(await storage.provider.get()), ["synced"]);

    // Gone already (deleted elsewhere, or replaced by sync).
    assert.equal(await releaseSetupProvider("missing"), true);
  } finally {
    restore();
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  editableModelLabel,
  modelChoiceLabel,
  modelIdParts,
  parseModelDisplayName,
} from "../src/shared/model-display";
import { chooseChatModel } from "../src/shared/model-choice";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";

test("display names split on the first separator, keeping slashes in model names", () => {
  assert.deepEqual(
    parseModelDisplayName({
      name: "x",
      displayName: "OpenRouter / openai/gpt-5",
    }),
    { provider: "OpenRouter", label: "openai/gpt-5" },
  );
  assert.deepEqual(parseModelDisplayName({ name: "gpt-5" }), {
    provider: undefined,
    label: "gpt-5",
  });
  assert.deepEqual(
    parseModelDisplayName({ name: "m", displayName: "Own name" }),
    { provider: undefined, label: "Own name" },
  );
});

test("a known provider name is removed whole, also when it holds the separator", () => {
  const model = { name: "m1", displayName: "Work / Home / Fast" };
  assert.deepEqual(parseModelDisplayName(model, "Work / Home"), {
    provider: "Work / Home",
    label: "Fast",
  });
  assert.equal(
    editableModelLabel({ name: "m1", displayName: "Work / " }, "Work"),
    "",
  );
  assert.equal(
    parseModelDisplayName({ name: "m1", displayName: "Work / " }).label,
    "m1",
  );
});

test("model ids split at the first colon", () => {
  assert.deepEqual(modelIdParts("ollama:qwen3:8b"), {
    providerKey: "ollama",
    name: "qwen3:8b",
  });
});

test("the chat label names the model the background would choose", () => {
  const providers = {
    openai: {
      type: "openai" as const,
      label: "Work",
      models: [{ id: "openai:a", name: "a", displayName: "Work / Alpha" }],
    },
  };
  // A selection that no longer exists falls back to the first model.
  const choice = chooseChatModel(
    providers,
    { ...DEFAULT_PREFERENCES, selectedModelId: "gone" },
    "also-gone",
  );
  assert.deepEqual(choice && modelChoiceLabel(choice), {
    provider: "Work",
    name: "Alpha",
  });
});

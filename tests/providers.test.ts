import assert from "node:assert/strict";
import { test } from "node:test";
import { ZAI_MODELS } from "@earendil-works/pi-ai/providers/zai.models";
import { piModel } from "../src/background/pi-provider";
import { quickTaskConcurrency } from "../src/background/quick-tasks";
import { QUICK_TASK_CONCURRENCY } from "../src/shared/config";
import { providerConsentHost } from "../src/shared/provider-consent";
import { providerApiUrl } from "../src/shared/provider-urls";
import {
  ADD_PROVIDER_TYPES,
  PROVIDER_TYPES,
  providerBaseUrlPlacement,
  providerType,
} from "../src/shared/providers";
import { reasoningRequestParams } from "../src/shared/reasoning";

test("each provider type is described once, with a label and an API", () => {
  for (const type of PROVIDER_TYPES) {
    assert.ok(providerType(type).label, type);
    assert.ok(providerType(type).api, type);
  }
  assert.ok(ADD_PROVIDER_TYPES.every((type) => PROVIDER_TYPES.includes(type)));
  assert.equal(providerType("unknown").api, "openai-completions");
});

test("API URLs come from the stored base URL, the type's default and its API path", () => {
  assert.equal(
    providerApiUrl("ollama", "http://localhost:11434/", "/chat/completions"),
    "http://localhost:11434/v1/chat/completions",
  );
  assert.equal(
    providerApiUrl("openai", undefined, "/models"),
    "https://api.openai.com/v1/models",
  );
  assert.equal(
    piModel({
      provider: "ollama",
      apiKey: "",
      baseUrl: "http://host:11434",
      modelName: "m",
    }).baseUrl,
    "http://host:11434/v1",
  );
  const anthropic = piModel({
    provider: "anthropic",
    apiKey: "",
    baseUrl: "https://proxy.example/v1/",
    modelName: "m",
  });
  assert.equal(anthropic.api, "anthropic-messages");
  assert.equal(anthropic.baseUrl, "https://proxy.example/v1");
  assert.equal(
    providerConsentHost({ type: "gemini" }),
    "generativelanguage.googleapis.com",
  );
});

test("the reasoning field and quick task concurrency are properties of the type", () => {
  assert.deepEqual(reasoningRequestParams("openrouter", "high"), {
    reasoning: { effort: "high" },
  });
  assert.deepEqual(reasoningRequestParams("glm", "low"), {
    reasoning_effort: "low",
  });
  assert.deepEqual(reasoningRequestParams("anthropic", "high"), {});
  const cloud = "https://api.example.com/v1";
  assert.equal(
    quickTaskConcurrency({ provider: "ollama", baseUrl: cloud }),
    providerType("ollama").quickTaskConcurrency,
  );
  assert.equal(
    quickTaskConcurrency({ provider: "openai", baseUrl: cloud }),
    QUICK_TASK_CONCURRENCY,
  );
});

test("a model Pi's catalog knows gets its inputs and limits from there", () => {
  const [name, entry] = Object.entries(ZAI_MODELS).find(
    ([, model]) => !model.input.includes("image"),
  )!;
  const known = piModel({
    provider: "glm",
    apiKey: "",
    baseUrl: "https://api.z.ai/api/paas/v4",
    modelName: name,
  });
  assert.deepEqual(known.input, ["text"]);
  assert.equal(known.maxTokens, entry.maxTokens);
  const unknown = piModel({
    provider: "openai",
    apiKey: "",
    baseUrl: "https://x.example/v1",
    modelName: "no-such-model",
  });
  assert.deepEqual(unknown.input, ["text", "image"]);
});

test("a server the user names asks for its base URL first; a named service keeps its own under Advanced", () => {
  assert.deepEqual(
    Object.fromEntries(
      PROVIDER_TYPES.map((type) => [type, providerBaseUrlPlacement(type)]),
    ),
    {
      openai: "main",
      "openai-responses": "main",
      anthropic: "main",
      ollama: "main",
      gemini: "none",
      deepseek: "advanced",
      openrouter: "advanced",
      aihubmix: "advanced",
      glm: "advanced",
      aigateway: "advanced",
      minimax: "advanced",
    },
  );
  // Every field shown first starts from the type's default (Ollama's local
  // server), so an empty one still reaches a server.
  for (const type of PROVIDER_TYPES)
    if (providerBaseUrlPlacement(type) === "main")
      assert.ok(providerType(type).defaultBaseUrl, type);
  assert.equal(providerType("ollama").defaultBaseUrl, "http://localhost:11434");
});

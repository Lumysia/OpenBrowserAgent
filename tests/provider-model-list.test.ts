import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { listModels } from "../src/background/provider-requests";
import {
  modelListRequest,
  parseModelList,
} from "../src/shared/provider-model-list";
import {
  PROVIDER_TYPES,
  providerBaseUrlOptions,
  providerModelList,
  providerType,
} from "../src/shared/providers";
import { ProviderConsentError } from "../src/shared/user-errors";

afterEach(() => mock.restoreAll());

test("OpenAI-compatible endpoints list models at /models with a bearer key", () => {
  assert.deepEqual(
    modelListRequest("openai", {
      baseUrl: "https://proxy.example/v1/",
      apiKey: "sk-1",
    }),
    {
      url: "https://proxy.example/v1/models",
      headers: { authorization: "Bearer sk-1" },
    },
  );
  assert.deepEqual(modelListRequest("deepseek", {}), {
    url: "https://api.deepseek.com/v1/models",
    headers: {},
  });
  assert.deepEqual(
    parseModelList("openai", {
      data: [
        { id: "gpt-a", context_length: 128000 },
        { name: "named" },
        { object: "model" },
      ],
    }),
    [
      { name: "gpt-a", contextLength: 128000 },
      { name: "named", contextLength: undefined },
    ],
  );
  // Compatible servers that answer with `models`, or with plain names.
  assert.deepEqual(
    parseModelList("openrouter", { models: ["a", "b"] }).map(
      (model) => model.name,
    ),
    ["a", "b"],
  );
  assert.deepEqual(parseModelList("openai", { error: "nope" }), []);
});

test("Anthropic-compatible endpoints list models with its version and key headers", () => {
  assert.deepEqual(
    modelListRequest("anthropic", {
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "key",
    }),
    {
      url: "https://api.anthropic.com/v1/models",
      headers: { "anthropic-version": "2023-06-01", "x-api-key": "key" },
    },
  );
  assert.deepEqual(
    parseModelList("anthropic", {
      data: [
        { id: "claude-x", display_name: "Claude X", type: "model" },
        { id: "claude-y" },
      ],
    }),
    [
      { name: "claude-x", label: "Claude X", contextLength: undefined },
      { name: "claude-y", label: "claude-y", contextLength: undefined },
    ],
  );
});

test("Gemini lists the models that generate content, with the key in a header", () => {
  assert.deepEqual(modelListRequest("gemini", { apiKey: "g" }), {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: { "x-goog-api-key": "g" },
  });
  assert.deepEqual(
    parseModelList("gemini", {
      models: [
        {
          name: "models/gemini-x",
          displayName: "Gemini X",
          inputTokenLimit: 1048576,
          supportedGenerationMethods: ["generateContent", "countTokens"],
        },
        {
          name: "models/embedding",
          supportedGenerationMethods: ["embedContent"],
        },
      ],
    }),
    [{ name: "gemini-x", label: "Gemini X", contextLength: 1048576 }],
  );
});

test("Ollama lists models in its own API at the server's root, without a key", () => {
  assert.equal(providerModelList("ollama"), "ollama");
  assert.deepEqual(
    modelListRequest("ollama", {
      baseUrl: "http://localhost:11434/",
      apiKey: "ignored",
    }),
    { url: "http://localhost:11434/api/tags", headers: {} },
  );
  assert.deepEqual(
    parseModelList("ollama", {
      models: [{ name: "llama3:8b", model: "llama3:8b" }, {}],
    }),
    [{ name: "llama3:8b" }],
  );
});

test("every type lists its models one known way, and offers its default base URL first", () => {
  for (const type of PROVIDER_TYPES) {
    assert.ok(providerModelList(type), type);
    const options = providerBaseUrlOptions(type);
    if (options.length)
      assert.equal(options[0], providerType(type).defaultBaseUrl);
  }
  assert.deepEqual(providerBaseUrlOptions("glm"), [
    "https://api.z.ai/api/paas/v4",
    "https://open.bigmodel.cn/api/paas/v4",
  ]);
  assert.deepEqual(providerBaseUrlOptions("openai"), []);
});

test("listing models names them after the provider and needs its permission", async () => {
  const fetch = mock.method(globalThis, "fetch", async () =>
    Response.json({ data: [{ id: "m1" }, { id: "m2", context_length: 8192 }] }),
  );
  const models = await listModels({
    providerId: "local",
    config: {
      type: "openai",
      label: "Box",
      baseUrl: "http://127.0.0.1:9/v1",
      apiKey: "k",
    },
  });
  assert.deepEqual(models, [
    { id: "local:m1", name: "m1", displayName: "Box / m1" },
    {
      id: "local:m2",
      name: "m2",
      displayName: "Box / m2",
      contextLength: 8192,
    },
  ]);
  const [url, init] = fetch.mock.calls[0].arguments;
  assert.equal(url, "http://127.0.0.1:9/v1/models");
  assert.deepEqual(init?.headers, { authorization: "Bearer k" });

  // A remote endpoint without permission gets no request, not even the key.
  await assert.rejects(
    listModels({
      providerId: "remote",
      config: { type: "openai", baseUrl: "https://remote.example/v1" },
    }),
    ProviderConsentError,
  );
  assert.equal(fetch.mock.callCount(), 1);
});

test("a failed listing reports the server's answer, or its status", async () => {
  const config = { type: "ollama" as const, baseUrl: "http://127.0.0.1:9" };
  mock.method(
    globalThis,
    "fetch",
    async () => new Response("model store offline", { status: 503 }),
  );
  await assert.rejects(listModels({ providerId: "o", config }), {
    message: "model store offline",
  });
  mock.restoreAll();
  mock.method(
    globalThis,
    "fetch",
    async () => new Response("", { status: 401 }),
  );
  await assert.rejects(listModels({ providerId: "o", config }), {
    message: "HTTP 401",
  });
});

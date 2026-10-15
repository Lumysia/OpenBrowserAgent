import assert from "node:assert/strict";
import { test } from "node:test";
import { requestText, type ProviderModel } from "../src/background/pi-provider";
import { rejectsField } from "../src/background/request-rejection";
import {
  QUICK_TASK_PRIORITY,
  quickTaskConcurrency,
  requestQuickText,
  withQuickTaskTurn,
} from "../src/background/quick-tasks";
import {
  providerThinkingSwitch,
  type ThinkingSwitch,
} from "../src/shared/thinking-switch";
import type { ProviderId } from "../src/shared/providers";
import { providerFixture, reply } from "./provider-fixtures";

type Body = Record<string, any>;
type Handler = Parameters<typeof providerFixture>[0];

// A cloud host for the fixture: requests to it go to the local fixture, so
// the endpoint does not count as local.
const CLOUD = "https://cloud.example";

async function withFixture<T>(
  handle: Handler,
  run: (fixture: Awaited<ReturnType<typeof providerFixture>>) => Promise<T>,
) {
  const fixture = await providerFixture(handle);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith(CLOUD)) return realFetch(input, init);
    const local = fixture.baseUrl + url.slice(CLOUD.length);
    return realFetch(
      input instanceof Request ? new Request(local, input) : local,
      init,
    );
  };
  try {
    return await run(fixture);
  } finally {
    globalThis.fetch = realFetch;
    await fixture.close();
  }
}

const ok: Handler = (request, response) =>
  reply(response, request.protocol, { text: "OK" });

function fixtureModel(
  provider: ProviderId,
  modelName: string,
  host: string,
  thinkingSwitch?: ThinkingSwitch,
): ProviderModel {
  const path =
    provider === "ollama" ? "" : provider === "gemini" ? "/v1beta" : "/v1";
  return {
    provider,
    apiKey: "fixture",
    modelName,
    baseUrl: `${host}${path}`,
    thinkingSwitch,
  };
}

async function quickBody(
  provider: ProviderId,
  modelName: string,
  {
    local = false,
    thinkingSwitch = undefined as ThinkingSwitch | undefined,
  } = {},
) {
  return withFixture(ok, async (fixture) => {
    const model = fixtureModel(
      provider,
      modelName,
      local ? fixture.baseUrl : CLOUD,
      thinkingSwitch,
    );
    const { text } = await requestQuickText(
      model,
      { prompt: "Hi" },
      QUICK_TASK_PRIORITY.interactive,
    );
    assert.equal(text, "OK");
    return fixture.requests[0].body as Body;
  });
}

test("catalog models get the lowest thinking level the catalog lists", async () => {
  // gpt-5-mini starts at minimal, gpt-5.1 can turn reasoning off ("none"),
  // gpt-5-pro only takes high; gpt-4o does not reason.
  for (const [modelName, effort] of [
    ["gpt-5-mini", "minimal"],
    ["gpt-5.1", "none"],
    ["gpt-5-pro", "high"],
    ["gpt-4o", undefined],
  ])
    assert.equal(
      (await quickBody("openai", modelName!)).reasoning_effort,
      effort,
      modelName,
    );
  assert.equal(
    (await quickBody("openai", "gpt-4o")).chat_template_kwargs,
    undefined,
  );

  const responses = await quickBody("openai-responses", "gpt-5.1");
  assert.equal(responses.reasoning.effort, "none");

  assert.deepEqual(
    (await quickBody("openrouter", "openai/gpt-5-mini")).reasoning,
    { effort: "minimal" },
  );
  assert.deepEqual((await quickBody("glm", "glm-5.2")).thinking, {
    type: "disabled",
  });

  assert.deepEqual(
    (await quickBody("anthropic", "claude-sonnet-4-5")).thinking,
    { type: "disabled" },
  );

  const gemini = async (modelName: string) =>
    (await quickBody("gemini", modelName)).generationConfig?.thinkingConfig;
  assert.deepEqual(await gemini("gemini-2.5-flash"), { thinkingBudget: 0 });
  // No "minimal" on these: the lowest is low.
  assert.equal((await gemini("gemini-3.1-pro-preview")).thinkingLevel, "LOW");
  assert.equal((await gemini("gemini-3.7-flash")).thinkingLevel, "LOW");
  assert.equal(
    (await gemini("gemini-3-flash-preview")).thinkingLevel,
    "MINIMAL",
  );
});

test("models the catalog does not know get only what their endpoint defines", async () => {
  // A local OpenAI-compatible server (llama.cpp, vLLM, SGLang).
  const local = await quickBody("openai", "qwen3.8-flash", { local: true });
  assert.deepEqual(local.chat_template_kwargs, { enable_thinking: false });
  assert.equal(local.reasoning_effort, undefined);

  // The same model on a cloud service: nothing it may not know.
  const cloud = await quickBody("openai", "qwen3.8-flash");
  assert.equal(cloud.chat_template_kwargs, undefined);
  assert.equal(cloud.reasoning_effort, undefined);

  assert.equal(
    (await quickBody("ollama", "qwen3", { local: true })).reasoning_effort,
    "none",
  );
  for (const provider of ["openrouter", "deepseek", "glm"] as ProviderId[]) {
    const body = await quickBody(provider, "fixture/unknown");
    assert.equal(body.reasoning, undefined, provider);
    assert.equal(body.thinking, undefined, provider);
    assert.equal(body.reasoning_effort, undefined, provider);
  }
  assert.equal(
    (await quickBody("gemini", "gemini-unknown")).generationConfig
      ?.thinkingConfig,
    undefined,
  );
});

test("the provider's thinking switch overrides the automatic choice", async () => {
  const cloud = (thinkingSwitch: ThinkingSwitch) =>
    quickBody("openai", "fixture", { thinkingSwitch });
  assert.deepEqual((await cloud("chatTemplate")).chat_template_kwargs, {
    enable_thinking: false,
  });
  const effort = await cloud("reasoningEffort");
  assert.equal(effort.reasoning_effort, "none");
  assert.equal(effort.chat_template_kwargs, undefined);
  assert.equal(
    (
      await quickBody("openai", "gpt-5-mini", {
        thinkingSwitch: "reasoningEffort",
      })
    ).reasoning_effort,
    "minimal",
  );
  const none = await quickBody("openai", "fixture", {
    local: true,
    thinkingSwitch: "none",
  });
  assert.equal(none.chat_template_kwargs, undefined);
  assert.equal(none.reasoning_effort, undefined);
});

test("chat keeps the user's effort; quick fields only on quick requests", async () => {
  await withFixture(ok, async (fixture) => {
    const model = fixtureModel("openai", "fixture", fixture.baseUrl);
    await requestText(model, { prompt: "Hi" }, { reasoning: "high" });
    await requestText(model, { prompt: "Hi" });
    assert.equal(fixture.requests[0].body.reasoning_effort, "high");
    assert.equal(fixture.requests[0].body.chat_template_kwargs, undefined);
    assert.equal(fixture.requests[1].body.chat_template_kwargs, undefined);
  });
});

function refuse(status: number, body: object, headers = {}): Handler {
  return (request, response) =>
    response
      .writeHead(status, { "Content-Type": "application/json", ...headers })
      .end(JSON.stringify(body));
}

test("a 400 naming a quick field retries once without it, and is remembered", async () => {
  const rejectTemplate = refuse(400, {
    error: {
      message: "Unrecognized request argument supplied: chat_template_kwargs",
    },
  });
  await withFixture(
    (request, response, requests) =>
      request.body.chat_template_kwargs
        ? rejectTemplate(request, response, requests)
        : ok(request, response, requests),
    async (fixture) => {
      const model = fixtureModel("openai", "fixture-400", fixture.baseUrl);
      const first = await requestQuickText(
        model,
        { prompt: "Hi" },
        QUICK_TASK_PRIORITY.interactive,
      );
      assert.equal(first.text, "OK");
      assert.equal(fixture.requests.length, 2);
      assert.equal(fixture.requests[1].body.chat_template_kwargs, undefined);
      // The same endpoint and model, written another way.
      await requestQuickText(
        { ...model, baseUrl: `${model.baseUrl}/` },
        { prompt: "Hi" },
        QUICK_TASK_PRIORITY.background,
      );
      assert.equal(fixture.requests.length, 3);
      assert.equal(fixture.requests[2].body.chat_template_kwargs, undefined);
    },
  );
});

test("Gemini's refusal to turn thinking off falls back to a plain request", async () => {
  // Pi's catalog lists "off" for Gemini 2.5 Pro, which only thinks.
  const rejectBudget = refuse(400, {
    error: {
      code: 400,
      message: "Budget 0 is invalid. This model only works in thinking mode.",
      status: "INVALID_ARGUMENT",
    },
  });
  await withFixture(
    (request, response, requests) =>
      request.body.generationConfig?.thinkingConfig
        ? rejectBudget(request, response, requests)
        : ok(request, response, requests),
    async (fixture) => {
      const { text } = await requestQuickText(
        fixtureModel("gemini", "gemini-2.5-pro", CLOUD),
        { prompt: "Hi" },
        QUICK_TASK_PRIORITY.interactive,
      );
      assert.equal(text, "OK");
      assert.equal(fixture.requests.length, 2);
    },
  );
});

test("other request errors keep the quick fields and are not retried without them", async () => {
  const cases: Array<[string, Handler, RegExp]> = [
    [
      "a 400 about something else",
      refuse(400, { error: { message: "messages: field required" } }),
      /field required/,
    ],
    [
      "a 404",
      refuse(404, { error: { message: "model not found" } }),
      /model not found/,
    ],
    [
      "a 429 that mentions reasoning",
      refuse(
        429,
        {
          error: { message: "Rate limit reached for reasoning_effort models" },
        },
        { "Retry-After": "0" },
      ),
      /Rate limit/,
    ],
  ];
  for (const [name, handle, error] of cases)
    await withFixture(handle, async (fixture) => {
      const model = fixtureModel("openai", `fixture-${name}`, fixture.baseUrl);
      await assert.rejects(
        requestQuickText(
          model,
          { prompt: "Hi" },
          QUICK_TASK_PRIORITY.interactive,
        ),
        error,
        name,
      );
      assert.ok(
        fixture.requests.every((request) => request.body.chat_template_kwargs),
        name,
      );
    });
});

test("a field counts as named when the error has every word of it", () => {
  const refused = (status: number, message: string) =>
    rejectsField({ status, message }, ["reasoning_effort"], [400, 422]);
  assert.ok(refused(400, "Unsupported value: 'reasoningEffort' is minimal"));
  assert.ok(refused(422, "reasoning effort must be one of low, high"));
  assert.ok(!refused(400, "reasoning is not available"));
  assert.ok(!refused(429, "reasoning_effort: rate limited"));
  assert.ok(
    rejectsField({ message: "image input is not supported" }, [
      /image.*not support/,
    ]),
  );
});

test("thinking is reported, never passed on as answer text", async () => {
  const fixture = await providerFixture((request, response) =>
    reply(response, request.protocol, { thinking: "Hmm.", text: "Answer" }),
  );
  try {
    const model = {
      provider: "openai" as const,
      apiKey: "fixture",
      modelName: "fixture",
      baseUrl: `${fixture.baseUrl}/v1`,
    };
    const text: string[] = [];
    let thinking = 0;
    await requestText(
      model,
      { prompt: "Hi" },
      { onText: (delta) => text.push(delta), onThinking: () => thinking++ },
    );
    assert.equal(text.join(""), "Answer");
    assert.ok(thinking > 0);
  } finally {
    await fixture.close();
  }
});

test("page translation runs one batch at a time on local endpoints", () => {
  const at = (provider: ProviderId, baseUrl: string) =>
    quickTaskConcurrency({ provider, baseUrl });
  assert.equal(at("openai", "http://127.0.0.1:8080/v1"), 1);
  assert.equal(at("openai", "http://192.168.1.20:8000/v1"), 1);
  assert.equal(at("ollama", "http://localhost:11434"), 1);
  assert.equal(at("ollama", "https://ollama.example.com"), 2);
  assert.equal(at("openai", "https://api.openai.com/v1"), 4);
});

test("a smart bar request overtakes queued page translation batches", async () => {
  const model = {
    provider: "openai" as const,
    baseUrl: "http://127.0.0.1:9/v1",
  };
  const started: string[] = [];
  const releases = new Map<string, () => void>();
  const task = (name: string, priority: "interactive" | "background") =>
    withQuickTaskTurn(model, priority, undefined, () => {
      started.push(name);
      return new Promise<void>((resolve) => releases.set(name, resolve));
    });
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  const batches = ["batch 1", "batch 2", "batch 3"].map((name) =>
    task(name, QUICK_TASK_PRIORITY.background),
  );
  await tick();
  assert.deepEqual(started, ["batch 1"]);

  const smartBar = task("smart bar", QUICK_TASK_PRIORITY.interactive);
  await tick();
  // It does not wait behind the queued batches.
  assert.deepEqual(started, ["batch 1", "smart bar"]);

  releases.get("batch 1")!();
  await tick();
  // The endpoint is busy with the smart bar request: batch 2 waits for it.
  assert.deepEqual(started, ["batch 1", "smart bar"]);

  releases.get("smart bar")!();
  await smartBar;
  await tick();
  assert.deepEqual(started, ["batch 1", "smart bar", "batch 2"]);
  releases.get("batch 2")!();
  await tick();
  releases.get("batch 3")!();
  await Promise.all(batches);
  assert.deepEqual(started, ["batch 1", "smart bar", "batch 2", "batch 3"]);
});

test("a queued batch that is aborted leaves the line", async () => {
  const model = {
    provider: "openai" as const,
    baseUrl: "http://127.0.0.1:10/v1",
  };
  let release!: () => void;
  const first = withQuickTaskTurn(
    model,
    QUICK_TASK_PRIORITY.background,
    undefined,
    () => new Promise<void>((resolve) => (release = resolve)),
  );
  const controller = new AbortController();
  let ran = false;
  const second = withQuickTaskTurn(
    model,
    QUICK_TASK_PRIORITY.background,
    controller.signal,
    async () => {
      ran = true;
    },
  );
  const third = withQuickTaskTurn(
    model,
    QUICK_TASK_PRIORITY.background,
    undefined,
    async () => "third",
  );
  controller.abort(new Error("stopped"));
  await assert.rejects(second, /stopped/);
  release();
  await first;
  assert.equal(await third, "third");
  assert.equal(ran, false);
});

test("a provider's thinking switch applies only where the form offers it", () => {
  assert.equal(providerThinkingSwitch("openai", {}), "auto");
  assert.equal(
    providerThinkingSwitch("ollama", { thinkingSwitch: "chatTemplate" }),
    "chatTemplate",
  );
  assert.equal(
    providerThinkingSwitch("anthropic", { thinkingSwitch: "chatTemplate" }),
    "auto",
  );
  assert.equal(
    providerThinkingSwitch("openai", {
      thinkingSwitch: "later" as ThinkingSwitch,
    }),
    "auto",
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { requestText } from "../src/background/pi-provider";
import {
  lowestOpenAiEffort,
  quickReasoningPatch,
} from "../src/background/quick-reasoning";
import {
  QUICK_TASK_PRIORITY,
  quickTaskConcurrency,
  requestQuickText,
  withQuickTaskTurn,
} from "../src/background/quick-tasks";
import type { ProviderId } from "../src/shared/types";
import { providerFixture, reply } from "./provider-fixtures.mjs";

type Body = Record<string, any>;

async function quickBody(provider: ProviderId, modelName: string) {
  const fixture = await providerFixture((request, response) =>
    reply(response, request.protocol, { text: "OK" }),
  );
  try {
    const model = {
      provider,
      apiKey: "fixture",
      modelName,
      baseUrl: `${fixture.baseUrl}${provider === "ollama" ? "" : provider === "gemini" ? "/v1beta" : "/v1"}`,
    };
    const { text } = await requestQuickText(
      model,
      { prompt: "Hi" },
      QUICK_TASK_PRIORITY.interactive,
    );
    assert.equal(text, "OK");
    return fixture.requests[0].body as Body;
  } finally {
    await fixture.close();
  }
}

test("quick tasks ask each endpoint type for the least thinking", async () => {
  // A local OpenAI-compatible server (llama.cpp, vLLM, SGLang).
  const local = await quickBody("openai", "qwen3.8-flash");
  assert.deepEqual(local.chat_template_kwargs, { enable_thinking: false });
  assert.equal(local.reasoning_effort, undefined);
  const localGpt = await quickBody("openai", "gpt-oss-20b");
  assert.equal(localGpt.reasoning_effort, "low");

  assert.equal((await quickBody("ollama", "qwen3")).reasoning_effort, "none");
  for (const provider of ["deepseek", "glm"] as ProviderId[])
    assert.deepEqual((await quickBody(provider, "fixture")).thinking, {
      type: "disabled",
    });
  assert.deepEqual((await quickBody("openrouter", "qwen/qwen3")).reasoning, {
    effort: "none",
  });
  assert.deepEqual(
    (await quickBody("openrouter", "openai/gpt-5-mini")).reasoning,
    { effort: "minimal" },
  );
  assert.equal(
    (await quickBody("aihubmix", "o4-mini")).reasoning_effort,
    "low",
  );
  assert.equal(
    (await quickBody("aihubmix", "gpt-4.1")).reasoning_effort,
    undefined,
  );

  const responses = await quickBody("openai-responses", "gpt-5.1");
  assert.deepEqual(responses.reasoning, { effort: "none" });
  assert.equal(responses.include, undefined);

  const anthropic = await quickBody("anthropic", "claude-sonnet-4-5");
  assert.equal(anthropic.thinking, undefined);

  const flash = await quickBody("gemini", "gemini-2.5-flash");
  assert.deepEqual(flash.generationConfig.thinkingConfig, {
    thinkingBudget: 0,
  });
  const pro = await quickBody("gemini", "gemini-3-pro-preview");
  assert.deepEqual(pro.generationConfig.thinkingConfig, {
    thinkingLevel: "LOW",
  });
  const older = await quickBody("gemini", "gemini-2.0-flash");
  assert.equal(older.generationConfig?.thinkingConfig, undefined);
});

test("OpenAI's own endpoint gets only the effort its model family takes", () => {
  const patch = (modelName: string) =>
    quickReasoningPatch({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelName,
    });
  assert.deepEqual(patch("gpt-5-mini")!({ model: "x" }), {
    model: "x",
    reasoning_effort: "minimal",
  });
  assert.equal(patch("gpt-4o"), undefined);
  assert.equal(lowestOpenAiEffort("gpt-5.2"), "none");
  assert.equal(lowestOpenAiEffort("gpt-5-chat-latest"), undefined);
  assert.equal(lowestOpenAiEffort("o3"), "low");
});

test("chat keeps the user's effort; quick fields only on quick requests", async () => {
  const fixture = await providerFixture((request, response) =>
    reply(response, request.protocol, { text: "OK" }),
  );
  try {
    const model = {
      provider: "openai" as const,
      apiKey: "fixture",
      modelName: "fixture",
      baseUrl: `${fixture.baseUrl}/v1`,
    };
    await requestText(model, { prompt: "Hi" }, { reasoning: "high" });
    await requestText(model, { prompt: "Hi" });
    assert.equal(fixture.requests[0].body.reasoning_effort, "high");
    assert.equal(fixture.requests[0].body.chat_template_kwargs, undefined);
    assert.equal(fixture.requests[1].body.chat_template_kwargs, undefined);
  } finally {
    await fixture.close();
  }
});

test("a 400 naming a quick field retries once without it, and is remembered", async () => {
  const fixture = await providerFixture((request, response) => {
    if (request.body.chat_template_kwargs)
      return response
        .writeHead(400, { "Content-Type": "application/json" })
        .end(
          '{"error":{"message":"Unrecognized request argument supplied: chat_template_kwargs"}}',
        );
    reply(response, request.protocol, { text: "OK" });
  });
  try {
    const model = {
      provider: "openai" as const,
      apiKey: "fixture",
      modelName: "fixture-400",
      baseUrl: `${fixture.baseUrl}/v1`,
    };
    const first = await requestQuickText(
      model,
      { prompt: "Hi" },
      QUICK_TASK_PRIORITY.interactive,
    );
    assert.equal(first.text, "OK");
    assert.equal(fixture.requests.length, 2);
    assert.equal(fixture.requests[1].body.chat_template_kwargs, undefined);
    await requestQuickText(
      model,
      { prompt: "Hi" },
      QUICK_TASK_PRIORITY.background,
    );
    assert.equal(fixture.requests.length, 3);
    assert.equal(fixture.requests[2].body.chat_template_kwargs, undefined);
  } finally {
    await fixture.close();
  }
});

test("other request errors are not retried without the quick fields", async () => {
  const fixture = await providerFixture((_request, response) =>
    response
      .writeHead(404, { "Content-Type": "application/json" })
      .end('{"error":{"message":"model not found"}}'),
  );
  try {
    const model = {
      provider: "openai" as const,
      apiKey: "fixture",
      modelName: "fixture-404",
      baseUrl: `${fixture.baseUrl}/v1`,
    };
    await assert.rejects(
      requestQuickText(
        model,
        { prompt: "Hi" },
        QUICK_TASK_PRIORITY.interactive,
      ),
      /model not found/,
    );
    assert.equal(fixture.requests.length, 1);
  } finally {
    await fixture.close();
  }
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

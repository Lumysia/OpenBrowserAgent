import assert from "node:assert/strict";
import { test } from "node:test";
import { requestText, type ProviderModel } from "../src/background/pi-provider";
import type { ProviderId } from "../src/shared/providers";
import type { ReasoningEffort } from "../src/shared/reasoning";
import { installChrome } from "./fake-chrome";
import {
  providerFixture,
  reply,
  type FixtureRequest,
} from "./provider-fixtures";

type Handler = Parameters<typeof providerFixture>[0];

const ok: Handler = (request, response) =>
  reply(response, request.protocol, { text: "OK" });

// The requests one prompt sends to `provider`'s `modelName` at `effort`.
async function requests(
  provider: ProviderId,
  modelName: string,
  effort: ReasoningEffort,
  handle: Handler = ok,
  ref?: ProviderModel["ref"],
): Promise<FixtureRequest[]> {
  const fixture = await providerFixture(handle);
  try {
    const model: ProviderModel = {
      provider,
      apiKey: "fixture",
      modelName,
      baseUrl: `${fixture.baseUrl}${provider === "gemini" ? "/v1beta" : "/v1"}`,
      ref,
    };
    await requestText(model, { prompt: "Hi" }, { reasoning: effort });
    return fixture.requests;
  } finally {
    await fixture.close();
  }
}

const first = async (...args: Parameters<typeof requests>) =>
  (await requests(...args))[0];

test("at the default effort, a request asks only to see the model's own thinking", async () => {
  // Gemini thinks by itself; its thoughts come back only when asked for.
  assert.deepEqual(
    (await first("gemini", "gemini-3-flash-preview", "default")).body
      .generationConfig.thinkingConfig,
    { includeThoughts: true },
  );
  // A Claude model the catalog marks as thinking by default gets its
  // thinking summarized instead of omitted.
  const thinksByDefault = await first(
    "anthropic",
    "claude-sonnet-5-5",
    "default",
  );
  assert.equal(thinksByDefault.body.thinking.type, "adaptive");
  assert.equal(thinksByDefault.body.thinking.display, "summarized");
  // Other Claude models do not think unless asked, and are not asked.
  for (const modelName of ["claude-opus-4-8", "fixture"])
    assert.equal(
      (await first("anthropic", modelName, "default")).body.thinking,
      undefined,
      modelName,
    );
});

test("the user's effort reaches every API in its own fields", async () => {
  const adaptive = await first("anthropic", "claude-opus-4-8", "medium");
  assert.deepEqual(adaptive.body.thinking, {
    type: "adaptive",
    display: "summarized",
  });
  assert.deepEqual(adaptive.body.output_config, { effort: "medium" });

  // A model with a thinking budget thinks between tool calls with the
  // interleaved thinking beta.
  const budget = await first("anthropic", "fixture", "high");
  assert.equal(budget.body.thinking.type, "enabled");
  assert.ok(budget.body.thinking.budget_tokens > 0);
  assert.match(String(budget.headers["anthropic-beta"]), /interleaved/);

  const gemini = (await first("gemini", "gemini-3-flash-preview", "low")).body
    .generationConfig.thinkingConfig;
  assert.deepEqual(gemini, { includeThoughts: true, thinkingLevel: "LOW" });

  const responses = (await first("openai-responses", "fixture", "low")).body;
  assert.deepEqual(responses.reasoning, { effort: "low", summary: "auto" });
  assert.deepEqual(responses.include, ["reasoning.encrypted_content"]);
});

test("a 400 naming a thinking field retries once without them, and is remembered", async () => {
  installChrome();
  const ref = { key: "fixture-thinking", config: "1" };
  const handle: Handler = (request, response, all) =>
    request.body.generationConfig?.thinkingConfig
      ? response.writeHead(400, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            error: {
              code: 400,
              message:
                "Invalid JSON payload: thinkingConfig.includeThoughts is not supported",
              status: "INVALID_ARGUMENT",
            },
          }),
        )
      : ok(request, response, all);
  const refused = await requests("gemini", "fixture", "default", handle, ref);
  assert.equal(refused.length, 2);
  assert.equal(refused[1].body.generationConfig?.thinkingConfig, undefined);
  // The next request leaves them out from the start.
  const later = await requests("gemini", "fixture", "default", handle, ref);
  assert.equal(later.length, 1);
  assert.equal(later[0].body.generationConfig?.thinkingConfig, undefined);
});

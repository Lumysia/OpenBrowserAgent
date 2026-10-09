import assert from "node:assert/strict";
import { test } from "node:test";
import { Agent } from "@earendil-works/pi-agent-core";
import { createProviderStream, piModel } from "../src/background/pi-provider";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import type { ProviderId } from "../src/shared/types";
import { providerFixture, reply, toolResults } from "./provider-fixtures.mjs";

for (const provider of [
  "openai",
  "openai-responses",
  "anthropic",
  "gemini",
  "ollama",
] as ProviderId[]) {
  test(`${provider}: actual HTTP streaming, reasoning, validated tool execution and result replay`, async () => {
    const fixture = await providerFixture((request, response) =>
      reply(
        response,
        request.protocol,
        toolResults(request).length
          ? { text: "Finished." }
          : {
              thinking: "Inspecting.",
              text: "Checking.",
              calls: [{ id: "call_1", name: "inspect", args: { tabId: 42 } }],
            },
      ),
    );
    try {
      const config = {
        provider,
        apiKey: "fixture-key",
        modelName: "fixture",
        baseUrl: `${fixture.baseUrl}${provider === "ollama" ? "" : provider === "gemini" ? "/v1beta" : "/v1"}`,
      };
      const agent = new Agent({
        streamFn: createProviderStream(config, "high"),
        initialState: {
          model: piModel(config),
          tools: [
            {
              name: "inspect",
              label: "inspect",
              description: "Inspect a tab",
              parameters: {
                type: "object",
                properties: { tabId: { type: "number" } },
                required: ["tabId"],
              },
              execute: async (_id, args) => {
                assert.equal(agent.state.isStreaming, true);
                assert.equal(args.tabId, 42);
                assert.equal(agent.state.pendingToolCalls.size, 1);
                return {
                  content: [
                    { type: "text", text: "tab verified" },
                    { type: "image", mimeType: "image/png", data: "aGVsbG8=" },
                  ],
                  details: {},
                };
              },
            },
          ],
        },
      });
      const deltas: string[] = [];
      const thinking: string[] = [];
      agent.subscribe((event) => {
        if (event.type !== "message_update") return;
        if (event.assistantMessageEvent.type === "text_delta")
          deltas.push(event.assistantMessageEvent.delta);
        if (event.assistantMessageEvent.type === "thinking_delta")
          thinking.push(event.assistantMessageEvent.delta);
      });
      await agent.prompt("Inspect tab 42");
      assert.equal(agent.state.errorMessage, undefined);
      assert.equal(agent.state.isStreaming, false);
      assert.equal(fixture.requests.length, 2);
      assert.equal(deltas.join(""), "Checking.Finished.");
      assert.equal(thinking.join(""), "Inspecting.");
      assert.equal(toolResults(fixture.requests[1]).length, 1);
      assert.match(
        JSON.stringify(toolResults(fixture.requests[1])),
        /tab verified/,
      );
      assert.match(JSON.stringify(fixture.requests[1].body), /aGVsbG8=/);
      assert.ok(
        agent.state.messages.some(
          (message) =>
            message.role === "assistant" && message.usage.totalTokens === 15,
        ),
      );
      if (provider === "anthropic")
        assert.match(
          JSON.stringify(fixture.requests[1].body),
          /fixture-signature/,
        );
      if (provider === "gemini")
        assert.match(
          JSON.stringify(fixture.requests[1].body),
          /Zml4dHVyZS1zaWduYXR1cmU=/,
        );
      if (provider === "openai-responses")
        assert.match(
          JSON.stringify(fixture.requests[1].body),
          /fixture-encrypted/,
        );
      if (provider === "openai")
        assert.equal(fixture.requests[0].body.reasoning_effort, "high");
    } finally {
      await fixture.close();
    }
  });
}

test("image rejection inside SSE retries once without a phantom assistant or lost tool transcript", async () => {
  const fixture = await providerFixture((request, response, requests) => {
    if (requests.length === 1) {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(
        'data: {"error":{"message":"unsupported image_url","type":"upstream_error"}}\n\n',
      );
    } else reply(response, request.protocol, { text: "Text fallback." });
  });
  try {
    const config = {
      provider: "openai" as const,
      apiKey: "",
      modelName: "fixture",
      baseUrl: `${fixture.baseUrl}/v1`,
    };
    let notices = 0;
    const agent = new Agent({
      streamFn: createProviderStream(config, undefined, () => notices++),
      initialState: { model: piModel(config) },
    });
    let starts = 0;
    agent.subscribe((event) => {
      if (event.type === "message_start" && event.message.role === "assistant")
        starts++;
    });
    await agent.prompt("Read this", [
      { type: "image", mimeType: "image/png", data: "aGVsbG8=" },
    ]);
    assert.equal(agent.state.errorMessage, undefined);
    assert.equal(notices, 1);
    assert.equal(starts, 1);
    assert.equal(fixture.requests.length, 2);
    assert.doesNotMatch(JSON.stringify(fixture.requests[1].body), /aGVsbG8=/);
    assert.equal(fixture.requests[1].headers.authorization, undefined);
  } finally {
    await fixture.close();
  }
});

test("default reasoning leaves provider defaults intact, and explicit effort remains opt-in", async () => {
  const fixture = await providerFixture((request, response) =>
    reply(response, request.protocol, { text: "OK" }),
  );
  try {
    for (const provider of [
      "openai-responses",
      "deepseek",
      "glm",
      "openrouter",
    ] as ProviderId[]) {
      const config = {
        provider,
        apiKey: "fixture",
        modelName: "fixture",
        baseUrl: `${fixture.baseUrl}/v1`,
      };
      await (
        await createProviderStream(config, "default")(
          piModel(config),
          normalizeContext({
            messages: [{ role: "user", content: "Hi", timestamp: 0 }],
          }),
        )
      ).result();
      const body = fixture.requests.at(-1)!.body;
      assert.equal(body.reasoning, undefined, provider);
      assert.equal(body.thinking, undefined, provider);
      assert.equal(body.reasoning_effort, undefined, provider);
    }
  } finally {
    await fixture.close();
  }
});

test("Anthropic preserves a configured proxy base path without requiring a /v1 suffix", async () => {
  const fixture = await providerFixture((request, response) =>
    reply(response, request.protocol, { text: "Proxy works" }),
  );
  try {
    const config = {
      provider: "anthropic" as const,
      apiKey: "fixture",
      modelName: "fixture",
      baseUrl: `${fixture.baseUrl}/proxy`,
    };
    await (
      await createProviderStream(config)(
        piModel(config),
        normalizeContext({
          messages: [{ role: "user", content: "Hi", timestamp: 0 }],
        }),
      )
    ).result();
    assert.equal(
      new URL(fixture.requests[0].url, fixture.baseUrl).pathname,
      "/proxy/messages",
    );
  } finally {
    await fixture.close();
  }
});

test("authentication errors are not retried as image failures", async () => {
  const fixture = await providerFixture((_request, response) =>
    response.writeHead(401).end('{"error":{"message":"bad key"}}'),
  );
  try {
    const config = {
      provider: "openai" as const,
      apiKey: "fixture",
      modelName: "fixture",
      baseUrl: `${fixture.baseUrl}/v1`,
    };
    const stream = await createProviderStream(config)(
      piModel(config),
      normalizeContext({
        messages: [
          {
            role: "user",
            timestamp: 0,
            content: [
              { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
            ],
          },
        ],
      }),
    );
    assert.equal((await stream.result()).stopReason, "error");
    assert.equal(fixture.requests.length, 1);
  } finally {
    await fixture.close();
  }
});

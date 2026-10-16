import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Agent } from "@earendil-works/pi-agent-core";
import { createEventHandler } from "../src/background/pi-events";
import { createProviderStream, piModel } from "../src/background/pi-provider";
import {
  applyPart,
  streamPartFromChunk,
} from "../src/shared/chat-stream-parts";
import type { ChatPart } from "../src/shared/types";
import { providerFixture, type FixtureRequest } from "./provider-fixtures";
import {
  REASONING_PROMPT,
  weatherTool,
  type ReasoningRecording,
} from "./reasoning-scenario";

// Replays streams recorded from live endpoints (see
// scripts/record-reasoning-fixtures.ts): a model reasons, calls a tool,
// then reasons again over its result. Both reasonings must reach the chat as
// reasoning parts in the order they streamed, and each request must ask for
// the reasoning and send the earlier turn's back.

type Case = {
  fixture: string;
  // What the first request asks for, and what the second carries back.
  asks: (request: FixtureRequest) => void;
  replays: RegExp;
};

const CASES: Case[] = [
  {
    fixture: "openai",
    asks: ({ body }) => assert.equal(body.reasoning_effort, "high"),
    replays: /"reasoning_content":"[^"]+/,
  },
  {
    fixture: "openai-responses",
    asks: ({ body }) => {
      assert.deepEqual(body.reasoning, { effort: "high", summary: "auto" });
      assert.deepEqual(body.include, ["reasoning.encrypted_content"]);
    },
    replays: /"type":"reasoning".*"encrypted_content":"[^"]+/,
  },
  {
    // A model that thinks by default: summarized thinking, effort left at
    // the API's default.
    fixture: "anthropic",
    asks: ({ body }) =>
      assert.deepEqual(
        { type: body.thinking.type, display: body.thinking.display },
        { type: "adaptive", display: "summarized" },
      ),
    replays: /"type":"thinking","thinking":"[^"]+","signature":"[^"]+/,
  },
  {
    // A model with a thinking budget thinks between tool calls only with
    // the interleaved thinking beta.
    fixture: "anthropic-budget",
    asks: ({ body, headers }) => {
      assert.equal(body.thinking.type, "enabled");
      assert.equal(body.thinking.display, "summarized");
      assert.match(String(headers["anthropic-beta"]), /interleaved-thinking/);
    },
    replays: /"type":"thinking","thinking":"[^"]+","signature":"[^"]+/,
  },
  {
    fixture: "gemini",
    asks: ({ body }) =>
      assert.deepEqual(body.generationConfig.thinkingConfig, {
        includeThoughts: true,
        thinkingLevel: "MEDIUM",
      }),
    replays: /"thought":true.*"thoughtSignature":"[^"]+/,
  },
];

function recording(name: string): ReasoningRecording {
  return JSON.parse(
    readFileSync(
      new URL(`./fixtures/reasoning/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
}

// The run's chat parts, as the sidepanel builds them from the stream, with
// the moment the tool's result came back.
async function replay(name: string) {
  const recorded = recording(name);
  const fixture = await providerFixture((request, response, requests) => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end(recorded.replies[requests.length - 1]);
  });
  try {
    const config = {
      provider: recorded.provider,
      apiKey: "fixture-key",
      modelName: recorded.model,
      baseUrl: `${fixture.baseUrl}${recorded.provider === "gemini" ? "/v1beta" : "/v1"}`,
    };
    let parts: ChatPart[] = [];
    let partsBeforeResult = -1;
    const events = createEventHandler((message) => {
      if (message.type !== "chunk") return;
      const { part } = streamPartFromChunk(message.chunk);
      if (part) parts = applyPart(parts, part);
    });
    const agent = new Agent({
      streamFn: createProviderStream(config, recorded.reasoning),
      initialState: {
        model: piModel(config),
        tools: [weatherTool(() => (partsBeforeResult = parts.length))],
      },
    });
    agent.subscribe((event) => events.handle(event));
    await agent.prompt(REASONING_PROMPT);
    assert.equal(agent.state.errorMessage, undefined);
    return { parts, partsBeforeResult, requests: fixture.requests };
  } finally {
    await fixture.close();
  }
}

const reasoned = (parts: ChatPart[]) =>
  parts.some((part) => part.type === "reasoning" && part.text?.trim());

for (const { fixture, asks, replays } of CASES) {
  test(`${fixture}: reasoning before a tool call and after its result both reach the chat`, async () => {
    const { parts, partsBeforeResult, requests } = await replay(fixture);
    assert.equal(requests.length, 2);
    asks(requests[0]);
    assert.match(JSON.stringify(requests[1].body), replays);

    const call = parts.findIndex((part) => part.toolName === "get_weather");
    assert.ok(call > 0, "the tool call is a part of the reply");
    assert.ok(partsBeforeResult > call, "the tool ran after its call");
    assert.ok(reasoned(parts.slice(0, call)), "reasoning before the call");
    assert.ok(
      reasoned(parts.slice(partsBeforeResult)),
      "reasoning after the result",
    );
    assert.equal(parts.at(-1)?.type, "text", "the answer comes last");
  });
}

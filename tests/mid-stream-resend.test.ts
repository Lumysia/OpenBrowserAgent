import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { test } from "node:test";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import { createEventHandler } from "../src/background/pi-events";
import {
  assistantMessage,
  createProviderStream,
  piModel,
  requestText,
} from "../src/background/pi-provider";
import {
  MID_STREAM_RESENDS,
  replyEvents,
} from "../src/background/reply-attempts";
import { streamPartFromChunk } from "../src/shared/chat-stream-parts";
import {
  appendAssistantPart,
  discardAssistantParts,
} from "../src/shared/chat-updates";
import type { ProviderId } from "../src/shared/providers";
import type { Chat } from "../src/shared/types";
import {
  providerFixture,
  reply,
  type FixtureHandler,
  type FixtureReply,
} from "./provider-fixtures";

// A run against a fixture endpoint, with the chat the sidepanel would build
// from the run's stream.
async function run(
  provider: ProviderId,
  answer: (
    attempt: number,
    send: (content: FixtureReply) => void,
    drop: () => Promise<void>,
  ) => unknown,
  { abortOnText = false } = {},
) {
  // Resolves once the agent has seen streamed content of the current attempt.
  let streamed = Promise.withResolvers<void>();
  const handler: FixtureHandler = async (request, response, requests) => {
    streamed = Promise.withResolvers<void>();
    const drop = async () => {
      await streamed.promise;
      response.destroy();
    };
    await answer(
      requests.length,
      (content) => reply(response as ServerResponse, request.protocol, content),
      drop,
    );
  };
  const fixture = await providerFixture(handler);
  const messageId = "reply";
  let chat = {
    id: "chat",
    messages: [{ id: messageId, role: "assistant", content: "", parts: [] }],
  } as unknown as Chat;
  const events = createEventHandler((message) => {
    if (message.type !== "chunk") return;
    const { delta, part, discard } = streamPartFromChunk(message.chunk);
    chat = discard
      ? discardAssistantParts(chat, messageId, discard)
      : appendAssistantPart(chat, { messageId, delta, part });
  }, messageId);
  const config = {
    provider,
    apiKey: "fixture-key",
    modelName: "fixture",
    baseUrl: `${fixture.baseUrl}/v1`,
  };
  const executed: string[] = [];
  const agent = new Agent({
    streamFn: createProviderStream(config),
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
          execute: async (id) => {
            executed.push(id);
            return { content: [{ type: "text", text: "done" }], details: {} };
          },
        },
      ],
    },
  });
  agent.subscribe((event) => {
    events.handle(event);
    if (event.type !== "message_update") return;
    streamed.resolve();
    if (abortOnText && event.assistantMessageEvent.type === "text_delta")
      agent.abort();
  });
  try {
    await agent.prompt("Inspect tab 42");
    await agent.waitForIdle();
    const replies = agent.state.messages.filter(
      (message: AgentMessage): message is AssistantMessage =>
        message.role === "assistant",
    );
    return {
      requests: fixture.requests,
      replies,
      executed,
      reply: chat.messages[0],
    };
  } finally {
    await fixture.close();
  }
}

const textOf = (message: AssistantMessage) =>
  message.content.flatMap((part) => (part.type === "text" ? [part.text] : []));

for (const provider of [
  "openai",
  "openai-responses",
  "anthropic",
] as ProviderId[]) {
  test(`${provider}: a reply whose connection drops mid-stream is requested again and replaces what it streamed`, async () => {
    const { requests, replies, executed, reply } = await run(
      provider,
      async (attempt, send, drop) => {
        if (attempt > 1) return send({ text: "The whole answer." });
        send({
          thinking: "Looking.",
          text: "The half",
          calls: [{ id: "call_cut", name: "inspect", args: { tabId: 42 } }],
          end: false,
        });
        await drop();
      },
    );
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].body, requests[0].body);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].stopReason, "stop");
    assert.deepEqual(textOf(replies[0]), ["The whole answer."]);
    assert.deepEqual(executed, [], "the cut tool call never runs");
    assert.equal(reply.content, "The whole answer.");
    assert.deepEqual(
      reply.parts?.map((part) => [part.type, part.text]),
      [["text", "The whole answer."]],
    );
  });
}

test("a plain text request streams the resent answer anew", async () => {
  const streamed = Promise.withResolvers<void>();
  const fixture = await providerFixture(async (request, response, requests) => {
    if (requests.length > 1)
      return reply(response, request.protocol, { text: "Fine." });
    reply(response, request.protocol, { text: "Cut", end: false });
    await streamed.promise;
    response.destroy();
  });
  try {
    let text = "";
    const result = await requestText(
      {
        provider: "openai",
        apiKey: "fixture-key",
        modelName: "fixture",
        baseUrl: `${fixture.baseUrl}/v1`,
      },
      { prompt: "Say fine" },
      {
        onText: (delta) => {
          text += delta;
          streamed.resolve();
        },
        onRestart: () => (text = ""),
      },
    );
    assert.equal(fixture.requests.length, 2);
    assert.equal(result.text, "Fine.");
    assert.equal(text, "Fine.");
  } finally {
    await fixture.close();
  }
});

test("a stopped reply is not requested again", async () => {
  const { requests, replies, reply } = await run(
    "openai",
    (_attempt, send) => send({ text: "Still writing", end: false }),
    { abortOnText: true },
  );
  assert.equal(requests.length, 1);
  assert.equal(replies.at(-1)?.stopReason, "aborted");
  assert.equal(reply.content, "Still writing");
});

test("after the last resend fails, the turn ends with the error and only the latest attempt's text", async () => {
  const { requests, replies, reply } = await run(
    "openai",
    async (attempt, send, drop) => {
      send({ text: `Attempt ${attempt}`, end: false });
      await drop();
    },
  );
  const last = `Attempt ${1 + MID_STREAM_RESENDS}`;
  assert.equal(requests.length, 1 + MID_STREAM_RESENDS);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].stopReason, "error");
  assert.deepEqual(textOf(replies[0]), [last]);
  assert.equal(reply.content, last);
});

test("an attempt that fails before streaming keeps the text already shown", async () => {
  const model = piModel({
    provider: "openai",
    apiKey: "",
    baseUrl: "http://fixture",
    modelName: "fixture",
  });
  const output = new AssistantMessageEventStream();
  const events = replyEvents(output);
  const partial = {
    ...assistantMessage(model),
    content: [],
  } as AssistantMessage;
  events.push({ type: "start", partial });
  const shown = {
    ...partial,
    content: [{ type: "text" as const, text: "Shown" }],
  };
  events.push({
    type: "text_delta",
    contentIndex: 0,
    delta: "Shown",
    partial: shown,
  });
  events.resend();
  const failed = { ...assistantMessage(model), stopReason: "error" as const };
  events.push({ type: "start", partial: failed });
  events.push({ type: "error", reason: "error", error: failed });
  const kinds: string[] = [];
  for await (const event of output) kinds.push(event.type);
  assert.deepEqual(kinds, ["start", "text_delta", "error"]);
  assert.deepEqual((await output.result()).content, shown.content);
});

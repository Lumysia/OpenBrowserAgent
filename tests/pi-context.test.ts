import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@earendil-works/pi-ai";
import { getCurrentTools } from "@earendil-works/pi-ai/utils/transcript";
import {
  applyPiContextBudget,
  contextLength,
  messageText,
} from "../src/background/pi-context-budget";
import { assistantMessage, piModel } from "../src/background/pi-provider";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";

const model = piModel({
  provider: "openai",
  apiKey: "",
  baseUrl: "",
  modelName: "fixture",
});
const user = (content: string): Message => ({
  role: "user",
  content,
  timestamp: 0,
});
const tool = (name: string) => ({
  name,
  description: name,
  parameters: { type: "object" },
});

test("context window preserves complete multi-call batches, latest user, and active system/tool deltas", () => {
  const messages: Message[] = [
    {
      role: "system",
      content: "Base prompt",
      toolsAdded: [tool("old")],
      timestamp: 0,
    },
    ...Array.from({ length: 12 }, () => user("old ".repeat(5000))),
    {
      role: "system",
      content: "Current instruction",
      toolsRemoved: [{ name: "old" }],
      toolsAdded: [tool("new")],
      timestamp: 1,
    },
    user("Latest real request"),
    {
      ...assistantMessage(model),
      content: [
        { type: "thinking", thinking: "reason", thinkingSignature: "signed" },
        { type: "toolCall", id: "a", name: "new", arguments: {} },
        { type: "toolCall", id: "b", name: "new", arguments: {} },
      ],
    },
    {
      role: "toolResult",
      toolCallId: "a",
      toolName: "new",
      content: [{ type: "text", text: "a" }],
      isError: false,
      timestamp: 2,
    },
    {
      role: "toolResult",
      toolCallId: "b",
      toolName: "new",
      content: [{ type: "text", text: "b" }],
      isError: false,
      timestamp: 2,
    },
  ];
  const before = structuredClone(messages);
  const budget = applyPiContextBudget(
    messages,
    {
      ...DEFAULT_PREFERENCES,
      contextRequestMaxChars: 16000,
      contextTailMinMessages: 2,
    },
    undefined,
    "Anchored summary",
  );
  assert.ok(budget.report.prunedMessages > 0);
  assert.deepEqual(
    getCurrentTools(budget.messages).map((item) => item.name),
    ["new"],
  );
  assert.match(
    messageText(budget.messages[0]),
    /Base prompt.*Current instruction/s,
  );
  assert.ok(
    budget.messages.some((message) =>
      messageText(message).includes("Latest real request"),
    ),
  );
  assert.equal(
    budget.messages.filter((message) => message.role === "toolResult").length,
    2,
  );
  assert.match(JSON.stringify(budget.messages), /signed/);
  assert.match(JSON.stringify(budget.messages), /Anchored summary/);
  assert.deepEqual(messages, before);
});

test("budget keeps every image in the latest user message and prunes older images", () => {
  const image = {
    type: "image" as const,
    mimeType: "image/png",
    data: "a".repeat(200000),
  };
  const toolResult = (id: string, raw = ""): Message => ({
    role: "toolResult",
    toolCallId: id,
    toolName: "inspect",
    timestamp: 1,
    isError: false,
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, loadedToolNames: [id], raw }),
      },
      image,
    ],
  });
  const messages: Message[] = [
    toolResult("old", "x".repeat(200000)),
    toolResult("recent"),
    {
      role: "user",
      timestamp: 2,
      content: [{ type: "text", text: "Compare these" }, image, image],
    },
  ];
  assert.ok(contextLength([image]) < 100);
  const budget = applyPiContextBudget(messages, DEFAULT_PREFERENCES);
  const images = (message: Message) =>
    JSON.stringify(message).split('"type":"image"').length - 1;
  assert.deepEqual(budget.messages.map(images), [0, 1, 2]);
  assert.match(JSON.stringify(budget.messages[0]), /contextPruned/);
  assert.match(JSON.stringify(budget.messages[0]), /loadedToolNames/);
});

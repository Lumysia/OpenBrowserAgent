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
import { createPiMessages } from "../src/background/pi-messages";
import { renderCompactionContext } from "../src/background/compaction-prompt";

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

test("media budgeting excludes base64 bytes and prunes older images and oversized tool output", () => {
  const image = {
    type: "image" as const,
    mimeType: "image/png",
    data: "a".repeat(200000),
  };
  const messages: Message[] = [
    {
      role: "user",
      timestamp: 0,
      content: [{ type: "text", text: "Picture" }, image],
    },
    {
      role: "toolResult",
      toolCallId: "a",
      toolName: "inspect",
      timestamp: 1,
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            loadedToolNames: ["inspect"],
            raw: "x".repeat(200000),
          }),
        },
        image,
      ],
    },
  ];
  assert.ok(contextLength([image]) < 100);
  const budget = applyPiContextBudget(messages, DEFAULT_PREFERENCES);
  assert.equal(budget.report.truncatedToolResults, 2);
  assert.match(JSON.stringify(budget.messages), /loadedToolNames/);
  assert.equal(
    JSON.stringify(budget.messages).split('"type":"image"').length - 1,
    1,
  );
  assert.equal(
    applyPiContextBudget(messages, {
      ...DEFAULT_PREFERENCES,
      contextBudgetEnabled: false,
    }).messages,
    messages,
  );
});

test("attachment context keeps text/audio/video metadata and image bytes in Pi's native content", () => {
  const attachments = [
    {
      id: "image",
      kind: "image" as const,
      type: "image/png",
      name: "picture.png",
      dataUrl: "data:image/png;base64,aGVsbG8=",
      size: 5,
    },
    {
      id: "audio",
      kind: "audio" as const,
      type: "audio/wav",
      name: "sound.wav",
      dataUrl: "data:audio/wav;base64,AAAA",
      size: 3,
    },
    {
      id: "text",
      kind: "text" as const,
      type: "text/plain",
      name: "notes.txt",
      text: "Important note",
      size: 14,
    },
  ];
  const messages = createPiMessages(
    model,
    [{ role: "user", id: "u", content: "Inspect", createdAt: 0 }],
    attachments,
    [],
  );
  assert.match(JSON.stringify(messages), /picture.png/);
  assert.match(JSON.stringify(messages), /sound.wav/);
  assert.match(JSON.stringify(messages), /notes.txt/);
  assert.match(JSON.stringify(messages), /aGVsbG8=/);
  assert.doesNotMatch(JSON.stringify(messages), /data:audio/);
  assert.doesNotMatch(
    renderCompactionContext(messages, 10000).join(""),
    /aGVsbG8=/,
  );
});

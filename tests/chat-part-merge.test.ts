import assert from "node:assert/strict";
import { test } from "node:test";
import {
  longerText,
  mergePart,
  streamedText,
} from "../src/shared/chat-part-merge";
import { applyPart } from "../src/shared/chat-stream-parts";
import {
  CHAT_PART_STATE,
  toolPartType,
  type ChatPart,
} from "../src/shared/types";

const tool = (fields: Partial<ChatPart>): ChatPart => ({
  id: "call-1",
  type: toolPartType("read"),
  toolName: "read",
  ...fields,
});

test("a tool part keeps fields the later version leaves out and never goes back", () => {
  const earlier = tool({
    state: CHAT_PART_STATE.outputAvailable,
    input: { source: "tab" },
    output: { title: "Page" },
  });
  const later = tool({ state: CHAT_PART_STATE.inputAvailable, step: "s1" });
  for (const text of [streamedText, longerText])
    assert.deepEqual(mergePart(earlier, later, text), {
      ...earlier,
      step: "s1",
      state: CHAT_PART_STATE.outputAvailable,
    });
});

test("a part of another type replaces the one with its id", () => {
  const earlier = tool({ state: CHAT_PART_STATE.inputAvailable });
  const later: ChatPart = { id: "call-1", type: "text", text: "hi" };
  assert.deepEqual(mergePart(earlier, later, streamedText), later);
});

test("streamed deltas append; two stored copies keep the longer text", () => {
  const earlier: ChatPart = { id: "t", type: "text", text: "Hello" };
  const delta: ChatPart = {
    id: "t",
    type: "text",
    text: " world",
    append: true,
  };
  assert.deepEqual(mergePart(earlier, delta, streamedText), {
    id: "t",
    type: "text",
    text: "Hello world",
  });
  const shorter: ChatPart = { id: "t", type: "text", text: "Hel" };
  assert.equal(mergePart(earlier, shorter, longerText).text, "Hello");
  assert.equal(mergePart(earlier, shorter, streamedText).text, "Hel");
});

test("applyPart merges an update into the part with its id", () => {
  const parts = applyPart([{ id: "t", type: "text", text: "a" }], {
    id: "t",
    type: "text",
    text: "b",
    append: true,
  });
  assert.deepEqual(parts, [{ id: "t", type: "text", text: "ab" }]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { isQuestionPending } from "../entrypoints/sidepanel/question-state";
import { messageRunEnded } from "../entrypoints/sidepanel/run-state";
import { toolDisplay } from "../entrypoints/sidepanel/tool-part-detail";
import { getMessages } from "../src/shared/i18n";
import { TOOL_NAME } from "../src/shared/tool-names";
import {
  CHAT_PART_STATE,
  toolPartType,
  type ChatMessage,
  type ChatPart,
} from "../src/shared/types";

const t = getMessages("en-US");
const input = {
  questions: [{ question: "Return it?", options: [{ label: "Yes" }] }],
};
const ask = (
  state: ChatPart["state"],
  output?: Record<string, unknown>,
): ChatPart => ({
  id: "ask",
  type: toolPartType(TOOL_NAME.ask),
  toolName: TOOL_NAME.ask,
  state,
  input,
  output,
});
const answered = {
  answers: [{ question: "Return it?", answers: ["Yes"] }],
};

test("a question is pending only while its tool runs in a run that goes on", () => {
  assert.equal(
    isQuestionPending(ask(CHAT_PART_STATE.inputAvailable), false),
    true,
  );
  // The model is still writing the call.
  assert.equal(
    isQuestionPending(ask(CHAT_PART_STATE.inputStreaming), false),
    true,
  );
  // The run ended, was stopped, or the background lost it.
  assert.equal(
    isQuestionPending(ask(CHAT_PART_STATE.inputAvailable), true),
    false,
  );
  // The tool returned: answered, the user wrote instead, or it failed.
  for (const part of [
    ask(CHAT_PART_STATE.outputAvailable, answered),
    ask(CHAT_PART_STATE.outputAvailable, { answers: [] }),
    ask(CHAT_PART_STATE.outputAvailable),
    ask(CHAT_PART_STATE.outputError, { error: "Timed out" }),
  ])
    assert.equal(isQuestionPending(part, false), false);
});

test("a question card's title says whether it waits, was answered, or not", () => {
  const title = (part: ChatPart, runEnded = false) =>
    toolDisplay(TOOL_NAME.ask, part, t, runEnded).title;
  const labels = t.sidepanel.tool[TOOL_NAME.ask];
  assert.equal(title(ask(CHAT_PART_STATE.inputAvailable)), labels.running);
  assert.equal(
    title(ask(CHAT_PART_STATE.outputAvailable, answered)),
    labels.done,
  );
  for (const [part, runEnded] of [
    [ask(CHAT_PART_STATE.inputAvailable), true],
    [ask(CHAT_PART_STATE.inputStreaming), true],
    [ask(CHAT_PART_STATE.outputAvailable, { answers: [] }), false],
    [ask(CHAT_PART_STATE.outputError, { error: "Timed out" }), false],
  ] as const)
    assert.equal(title(part, runEnded), t.sidepanel.questionUnanswered);
});

test("a failed tool does not end the reply's run", () => {
  const message: ChatMessage = {
    id: "reply",
    role: "assistant",
    content: "",
    createdAt: 1,
    metadata: { runMetrics: { startedAt: 1 } },
    parts: [
      {
        id: "tabs",
        type: toolPartType(TOOL_NAME.tabs),
        state: CHAT_PART_STATE.outputError,
        output: { error: "Invalid action" },
      },
      ask(CHAT_PART_STATE.inputAvailable),
    ],
  };
  assert.equal(messageRunEnded(message, false), false);
  assert.equal(messageRunEnded(message, true), true);
  assert.equal(
    messageRunEnded(
      { ...message, metadata: { runMetrics: { startedAt: 1, endedAt: 2 } } },
      false,
    ),
    true,
  );
});

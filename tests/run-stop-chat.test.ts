import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { historyMessages } from "../src/background/context/history";
import { piModel } from "../src/background/pi-provider";
import {
  appendAssistantPart,
  endAssistantRun,
} from "../src/shared/chat-updates";
import { normalizeChatContent } from "../src/shared/chats";
import { getMessages } from "../src/shared/i18n";
import {
  modelStopNote,
  replyCutOff,
  RUN_STOP_REASON,
  type CutReason,
} from "../src/shared/run-stop";
import type { Chat, ChatMessage } from "../src/shared/types";
import {
  assistantMessageContentFallback,
  assistantMessageText,
} from "../entrypoints/sidepanel/assistant-message-text";
import { RunStopNotice } from "../entrypoints/sidepanel/run-stop-notice";
import {
  chatToOpenAiPayload,
  importChatFromOpenAiJson,
} from "../entrypoints/sidepanel/chat-export";

const ERROR = "Stream ended without finish_reason";
const t = getMessages("en-US");

// A reply streamed up to "| 稠", then ended the way `end` says.
function cutChat(end: Parameters<typeof endAssistantRun>[2]): Chat {
  let chat: Chat = {
    id: "c",
    title: "t",
    createdAt: 1,
    updatedAt: 1,
    messages: [
      { id: "u", role: "user", content: "q", createdAt: 1 },
      {
        id: "a",
        role: "assistant",
        content: "",
        parts: [],
        createdAt: 2,
        metadata: { runMetrics: { startedAt: 2 } },
      },
    ],
  };
  chat = appendAssistantPart(chat, {
    messageId: "a",
    delta: "| 稠",
    part: { id: "t:0", type: "text", text: "| 稠", append: true },
  });
  return endAssistantRun(chat, "a", end);
}

const reply = (chat: Chat) => chat.messages[1];

test("an error ends the reply as a notice part, not as text in the reply", () => {
  const chat = cutChat({ endedAt: 3, error: ERROR });
  assert.equal(reply(chat).content, "| 稠");
  assert.deepEqual(replyCutOff(reply(chat)), {
    reason: RUN_STOP_REASON.error,
    errors: [ERROR],
  });
  // Recording the same end again (panel and background) adds nothing.
  const again = endAssistantRun(chat, "a", { endedAt: 4, error: ERROR });
  assert.equal(reply(again).parts?.length, reply(chat).parts?.length);
  // Stored chats keep the notice when read back.
  const stored = normalizeChatContent(JSON.parse(JSON.stringify(chat)));
  assert.deepEqual(replyCutOff(stored.messages[1]), replyCutOff(reply(chat)));
});

test("a reply that ended early renders once, with one notice under it", () => {
  const failed = reply(cutChat({ endedAt: 3, error: ERROR }));
  // No copy of the reply above its parts, as text appended to it gave.
  assert.equal(assistantMessageContentFallback(failed), "");
  assert.equal(assistantMessageText(failed), "| 稠");
  // Replies stored with the error appended to their text show as before.
  const older = {
    ...reply(cutChat({ endedAt: 3 })),
    content: `| 稠\n\n${ERROR}`,
  };
  assert.equal(assistantMessageContentFallback(older), older.content);
  const render = (message: ChatMessage, onContinue?: () => void) =>
    renderToStaticMarkup(
      createElement(RunStopNotice, {
        t,
        cut: replyCutOff(message)!,
        onContinue,
      }),
    );
  const notice = render(failed, () => {});
  assert.equal(notice.split(ERROR).length - 1, 1);
  assert.match(notice, new RegExp(`${t.sidepanel.runStop.continue}</button>`));
  const cases: Array<[CutReason, string]> = [
    [RUN_STOP_REASON.length, t.sidepanel.runStop.length],
    [RUN_STOP_REASON.aborted, t.sidepanel.runStop.aborted],
  ];
  for (const [stopReason, label] of cases) {
    const html = render(reply(cutChat({ endedAt: 3, stopReason })));
    assert.equal(html.split(label).length - 1, 1);
    // Continue is offered only where the view passes it (the latest reply).
    assert.doesNotMatch(html, /<button/);
  }
  assert.equal(
    replyCutOff(
      reply(cutChat({ endedAt: 3, stopReason: RUN_STOP_REASON.finished })),
    ),
    undefined,
  );
});

test("the export keeps how a reply ended and its error, and imports them back", async () => {
  for (const end of [
    { endedAt: 3, error: ERROR },
    { endedAt: 3, stopReason: RUN_STOP_REASON.length },
    { endedAt: 3, stopReason: RUN_STOP_REASON.aborted },
  ]) {
    const chat = cutChat(end);
    const payload = chatToOpenAiPayload(chat, { system: "s", tools: [] });
    const last = payload.messages.at(-1) as Record<string, unknown>;
    const cut = replyCutOff(reply(chat))!;
    assert.equal(last.content, "| 稠");
    assert.equal(last.stop_reason, cut.reason);
    assert.equal(last.error, cut.errors[0]);
    assert.equal(payload.metrics?.messages[0].metrics?.stopReason, cut.reason);
    const file = new File([JSON.stringify(payload)], "chat.openai.json");
    const imported = await importChatFromOpenAiJson(file, "Chat");
    assert.deepEqual(replyCutOff(imported.messages[1]), cut);
  }
  // A reply that failed before any text still shows up with its error.
  const failedEarly: ChatMessage = {
    id: "a",
    role: "assistant",
    content: "",
    parts: [],
    createdAt: 2,
  };
  const chat = endAssistantRun(
    { ...cutChat({ endedAt: 3 }), messages: [failedEarly] },
    "a",
    { endedAt: 3, error: ERROR },
  );
  const payload = chatToOpenAiPayload(chat, { system: "s", tools: [] });
  assert.deepEqual(payload.messages.at(-1), {
    role: "assistant",
    content: null,
    stop_reason: RUN_STOP_REASON.error,
    error: ERROR,
  });
});

test("a cut reply goes back to the model with a note, never as a finished answer", () => {
  const model = piModel({
    provider: "openai",
    apiKey: "",
    baseUrl: "http://127.0.0.1/v1",
    modelName: "fixture",
  });
  const options = {
    model,
    attachments: [],
    tools: true,
    compactArgs: () => false,
    skills: [],
  };
  for (const end of [
    { endedAt: 3, error: ERROR },
    { endedAt: 3, stopReason: RUN_STOP_REASON.length },
    { endedAt: 3, stopReason: RUN_STOP_REASON.aborted },
  ]) {
    const chat = cutChat(end);
    const next: ChatMessage = {
      id: "u2",
      role: "user",
      content: "next",
      createdAt: 4,
    };
    const messages = historyMessages([...chat.messages, next], options);
    const replayed = messages.find((message) => message.role === "assistant");
    assert.ok(replayed?.role === "assistant");
    assert.equal(replayed.stopReason, "stop");
    const text = replayed.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
    const cut = replyCutOff(reply(chat))!;
    assert.ok(text.startsWith("| 稠"));
    assert.ok(text.endsWith(modelStopNote(cut.reason)));
  }
  const finished = historyMessages(
    cutChat({ endedAt: 3, stopReason: RUN_STOP_REASON.finished }).messages,
    options,
  ).find((message) => message.role === "assistant");
  assert.deepEqual(finished?.role === "assistant" && finished.content, [
    { type: "text", text: "| 稠" },
  ]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@earendil-works/pi-ai";
import { historyMessages } from "../src/background/context/history";
import { CONTEXT_POLICY, tokenChars } from "../src/background/context/policy";
import { piModel } from "../src/background/pi-provider";
import { runPiAgent } from "../src/background/pi-runtime";
import {
  chatToOpenAiPayload,
  importChatFromOpenAiJson,
} from "../entrypoints/sidepanel/chat-export";
import {
  applyPart,
  streamPartFromChunk,
} from "../src/shared/chat-stream-parts";
import { TOOL_RESULT_NOTE } from "../src/shared/tool-results";
import type { ChatMessage, ChatPart } from "../src/shared/types";
import { installPiRuntimeBrowser, setupPiRuntime } from "./pi-runtime-helpers";
import { providerFixture, reply, toolResults } from "./provider-fixtures.mjs";

installPiRuntimeBrowser();

const model = piModel({
  provider: "openai",
  apiKey: "",
  baseUrl: "",
  modelName: "fixture",
});

const snapshot = `Tab 7: Messenger | http://fixture/chat\n${Array.from(
  { length: 300 },
  (_, index) => `- button "Contact ${index}" [e${index}]`,
).join("\n")}`;

function call(
  id: string,
  step: string,
  toolName: string,
  input: Record<string, unknown>,
  result?: ChatPart["result"],
  state: ChatPart["state"] = "output-available",
): ChatPart {
  return {
    id,
    type: `tool-${toolName}`,
    toolName,
    step,
    state,
    input,
    output: { steps: 1, done: 1 },
    ...(result ? { result } : {}),
  };
}

// A messenger task the way the side panel stores it: one call per model
// response, a long snapshot, a screenshot, a failed step, and a check.
function chat(): ChatMessage[] {
  return [
    { id: "u1", role: "user", content: "Send meow to myself", createdAt: 1 },
    {
      id: "a1",
      role: "assistant",
      content: "Looking.Sent and checked.",
      createdAt: 2,
      parts: [
        { id: "r1", type: "reasoning", text: "Plan the steps." },
        { id: "t1", type: "text", text: "Looking." },
        call(
          "call_snap",
          "s1",
          "snapshot",
          { tabId: 7 },
          { text: snapshot, artifact: "art-snap" },
        ),
        call(
          "call_shot",
          "s2",
          "screenshot",
          { tabId: 7 },
          { text: "Tab 7: Messenger", image: true },
        ),
        call(
          "call_open",
          "s3",
          "act",
          { tabId: 7, steps: [{ action: "click", ref: "e0" }] },
          { text: 'Clicked "Contact 0 (You)". Opened chat "Contact 0 (You)".' },
        ),
        call(
          "call_type",
          "s4",
          "act",
          { tabId: 7, steps: [{ action: "type", ref: "e9", text: "meow" }] },
          { text: "Element e9 is not editable." },
          "output-error",
        ),
        call(
          "call_send",
          "s5",
          "act",
          { tabId: 7, steps: [{ action: "type", ref: "e10", text: "meow" }] },
          { text: 'Typed "meow". Sent; the thread shows "meow ✓ delivered".' },
        ),
        { id: "t2", type: "text", text: "Sent and checked." },
      ],
    },
    { id: "u2", role: "user", content: "What did you do?", createdAt: 3 },
  ];
}

const render = (messages = chat(), tools = true) =>
  historyMessages(messages, {
    model,
    attachments: [],
    tools,
    compactArgs: () => false,
  });

const texts = (message: Message) =>
  typeof message.content === "string"
    ? message.content
    : message.content
        .map((part) => ("text" in part ? part.text : `[${part.type}]`))
        .join("");

test("an earlier turn replays its tool calls and shortened results in order", () => {
  const messages = render();
  assert.deepEqual(
    messages.map((message) => message.role),
    [
      "user",
      ...Array(5).fill(["assistant", "toolResult"]).flat(),
      "assistant",
      "user",
    ],
  );
  const calls = messages.flatMap((message) =>
    message.role === "assistant"
      ? message.content.flatMap((part) =>
          part.type === "toolCall" ? [[part.id, part.name]] : [],
        )
      : [],
  );
  assert.deepEqual(calls, [
    ["call_snap", "snapshot"],
    ["call_shot", "screenshot"],
    ["call_open", "act"],
    ["call_type", "act"],
    ["call_send", "act"],
  ]);
  const results = messages.filter((message) => message.role === "toolResult");
  // Each result follows its own call.
  results.forEach((result, index) =>
    assert.equal(result.toolCallId, calls[index][0]),
  );
  // Long outputs keep a head and the artifact with the full text.
  const snap = texts(results[0]);
  assert.ok(
    snap.length < tokenChars(CONTEXT_POLICY.historyToolOutputTokens) + 200,
  );
  assert.match(snap, /^Tab 7: Messenger/);
  assert.match(
    snap,
    /showed \d+ of \d+ characters\. The full output is "art-snap"/,
  );
  // Images are never replayed; the model is told one was there.
  assert.ok(
    results[1].role === "toolResult" &&
      results[1].content.every((part) => part.type === "text"),
  );
  assert.match(texts(results[1]), /earlier image was removed/);
  assert.equal(results[3].role === "toolResult" && results[3].isError, true);
  assert.match(texts(results[4]), /meow ✓ delivered/);
  // Text and reasoning: text stays with its response, reasoning is dropped.
  assert.match(texts(messages[1]), /^Looking\./);
  assert.doesNotMatch(JSON.stringify(messages), /Plan the steps/);
  assert.equal(texts(messages.at(-2)!), "Sent and checked.");
  // The latest user message is rendered as before.
  assert.match(texts(messages.at(-1)!), /<message>\nWhat did you do\?/);
});

test("replayed turns render identically every time", () => {
  const strip = (messages: Message[]) =>
    JSON.stringify(
      messages.map((message) => ({ ...message, timestamp: undefined })),
    );
  assert.equal(strip(render()), strip(render()));
  // A later turn does not change how an earlier one renders.
  const longer = [
    ...chat(),
    { id: "a2", role: "assistant", content: "Done.", createdAt: 4 },
    { id: "u3", role: "user", content: "Thanks", createdAt: 5 },
  ] as ChatMessage[];
  const before = render().slice(0, -1);
  assert.equal(strip(render(longer).slice(0, before.length)), strip(before));
});

test("a turn's replayed results stay within its budget, newest first", () => {
  const many = chat();
  many[1].parts = Array.from({ length: 40 }, (_, index) =>
    call(
      `call_${index}`,
      `s${index}`,
      "snapshot",
      { tabId: 7 },
      {
        text: snapshot,
        artifact: `art-${index}`,
      },
    ),
  );
  const results = render(many).filter(
    (message) => message.role === "toolResult",
  );
  const total = results.reduce((sum, result) => sum + texts(result).length, 0);
  assert.ok(
    total <= tokenChars(CONTEXT_POLICY.historyTurnToolTokens) + 40 * 200,
  );
  assert.match(
    texts(results[0]),
    /^\[Output of an earlier turn left out.*"art-0"/,
  );
  assert.match(texts(results.at(-1)!), /^Tab 7: Messenger/);
});

test("unfinished calls get a result, and runs without tools replay text", () => {
  const stopped = chat();
  stopped[1].parts = [
    call("call_open", "s1", "act", { tabId: 7 }, undefined, "input-available"),
  ];
  const messages = render(stopped);
  const result = messages.find((message) => message.role === "toolResult");
  assert.equal(texts(result!), TOOL_RESULT_NOTE.stopped);
  assert.equal(result?.role === "toolResult" && result.isError, true);

  const plain = render(chat(), false);
  assert.deepEqual(
    plain.map((message) => message.role),
    ["user", "assistant", "user"],
  );
  assert.match(
    texts(plain[1]),
    /<tool_call name="act">.*"type".*<\/tool_call>\n<tool_result error="true">/s,
  );
  assert.match(texts(plain[1]), /meow ✓ delivered[\s\S]*Sent and checked\./);
});

test("export writes what the model saw, and import reads it back", async () => {
  const messages = chat();
  const payload = chatToOpenAiPayload(
    { id: "c", title: "Meow", messages, createdAt: 0, updatedAt: 0 },
    { system: "Prompt", tools: [] },
  );
  const tool = (id: string) =>
    payload.messages.find(
      (message) => message.role === "tool" && message.tool_call_id === id,
    );
  assert.equal(tool("call_snap")?.content, snapshot);
  assert.equal(tool("call_shot")?.content, "Tab 7: Messenger\n[image]");
  assert.doesNotMatch(JSON.stringify(payload), /"steps":1,"done":1/);
  assert.deepEqual(payload.tool_errors, ["call_type"]);
  // One assistant message per model response.
  const assistants = payload.messages.filter(
    (message) => message.role === "assistant",
  );
  assert.equal(assistants.length, 6);

  const imported = await importChatFromOpenAiJson(
    new File([JSON.stringify(payload)], "Meow.openai.json"),
  );
  assert.deepEqual(
    imported.messages.map((message) => message.role),
    ["user", "assistant", "user"],
  );
  // Artifacts stay in the browser that made them; everything else of a
  // tool part the model sees comes back.
  const local = messages.map((message) => ({
    ...message,
    parts: message.parts?.map((part) =>
      part.result
        ? { ...part, result: { ...part.result, artifact: undefined } }
        : part,
    ),
  }));
  const toolParts = (items: ChatPart[] = []) =>
    items
      .filter((part) => part.toolName)
      .map(({ id, toolName, input, result, state }) => ({
        id,
        toolName,
        input,
        result: { ...result, artifact: undefined },
        state,
      }));
  assert.deepEqual(
    toolParts(imported.messages[1].parts),
    toolParts(local[1].parts),
  );
  // The imported chat replays to the model as the original would without
  // its artifacts.
  const replay = (items: ChatMessage[]) =>
    JSON.stringify(
      render(items).map((message) => ({ ...message, timestamp: 0 })),
    );
  assert.equal(replay(imported.messages), replay(local));
});

test("a run stores what the model received, and the next run replays it", async () => {
  const fixture = await providerFixture((request, response, requests) =>
    reply(
      response,
      request.protocol,
      requests.length === 1
        ? { calls: [{ id: "call_1", name: "tabs", args: { action: "list" } }] }
        : { text: "Done" },
    ),
  );
  const first = setupPiRuntime(fixture.baseUrl);
  try {
    await runPiAgent(first.options);
    let parts: ChatPart[] = [];
    for (const event of first.session.events) {
      const part =
        event.type === "chunk" ? streamPartFromChunk(event.chunk).part : null;
      if (part) parts = applyPart(parts, part);
    }
    const stored = parts.find((part) => part.id === "call_1");
    const seen = toolResults(fixture.requests[1])[0].content;
    assert.equal(stored?.result?.text, seen);
    assert.ok(stored?.step);

    const second = setupPiRuntime(fixture.baseUrl);
    second.options.messages = [
      ...first.options.messages,
      {
        id: "answer",
        role: "assistant",
        content: "Done",
        createdAt: 2,
        parts,
      },
      { id: "u2", role: "user", content: "What did you do?", createdAt: 3 },
    ];
    await runPiAgent(second.options);
    second.close();
    const body = fixture.requests.at(-1)!.body;
    const replayed = body.messages.find(
      (message: { tool_calls?: Array<{ id: string }> }) =>
        message.tool_calls?.[0]?.id === "call_1",
    );
    assert.equal(replayed.tool_calls[0].function.name, "tabs");
    assert.equal(toolResults(fixture.requests.at(-1)!)[0].content, seen);
  } finally {
    first.close();
    await fixture.close();
  }
});

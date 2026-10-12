import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { createContextEngine } from "../src/background/context/engine";
import { assistantMessage, piModel } from "../src/background/pi-provider";
import { textSlice } from "../src/background/tools/read";
import { memoryArtifacts } from "./pi-runtime-helpers";

const model = piModel({
  provider: "openai",
  apiKey: "",
  baseUrl: "",
  modelName: "fixture",
});

// A run transcript the way Pi builds it: prompt, tools, task, then turns of
// one tool call and its result.
function run(contextWindow = 20_000) {
  const summaries: string[] = [];
  const store = memoryArtifacts();
  const engine = createContextEngine({
    chatId: "chat",
    store,
    contextWindow,
    compactArgs: (name) => name === "editPage",
    async summarize(_system, prompt) {
      summaries.push(prompt);
      return `summary ${summaries.length}`;
    },
  });
  const messages: AgentMessage[] = [
    {
      role: "system",
      content: "Prompt",
      toolsAdded: [
        {
          name: "snapshot",
          description: "snapshot",
          parameters: { type: "object" },
        },
      ],
      timestamp: 0,
    },
    { role: "user", content: "Task", timestamp: 0 },
  ];
  let calls = 0;
  async function turn(
    output: string,
    input: Record<string, unknown> = {},
    say = "",
    name = "snapshot",
    image = false,
  ) {
    const id = `call-${++calls}`;
    messages.push({
      ...assistantMessage(model),
      content: [
        ...(say ? [{ type: "text" as const, text: say }] : []),
        { type: "toolCall", id, name, arguments: input },
      ],
    });
    const text = await engine.acceptToolOutput({
      toolCallId: id,
      toolName: name,
      input: { ...input, call: calls },
      text: output,
      repeatable: true,
    });
    messages.push({
      role: "toolResult",
      toolCallId: id,
      toolName: name,
      content: [
        { type: "text", text },
        ...(image
          ? [{ type: "image" as const, data: "AA==", mimeType: "image/png" }]
          : []),
      ],
      isError: false,
      timestamp: 0,
    });
    return text;
  }
  // What `read` returns for a stored output.
  const read = async (handle: string | undefined, offset = 0) => {
    const artifact = await store.get("chat", String(handle));
    return textSlice(String(handle), artifact?.text || "", { offset });
  };
  return { engine, messages, turn, summaries, read };
}

const page = (index: number, chars = 6_000) =>
  `page ${index} `.repeat(chars / 8).slice(0, chars);
const resultText = (message: AgentMessage | undefined) =>
  message?.role === "toolResult" && message.content[0]?.type === "text"
    ? message.content[0].text
    : "";
const handleIn = (text: string) => text.match(/art-[0-9a-f]{8}/)?.[0];

test("an oversized output is capped at the source and fully readable by handle", async () => {
  const { turn, read } = run();
  const original = page(1, 60_000);
  const shown = await turn(original);
  assert.ok(shown.length < 20_000);
  const handle = handleIn(shown);
  assert.ok(handle, "the preview names a handle");
  let text = "";
  for (let offset = 0; offset < original.length;) {
    const slice = await read(handle, offset);
    const body = slice.slice(slice.indexOf("\n") + 1);
    text += body;
    offset += body.length;
  }
  assert.equal(text, original);
});

test("the newest results are never masked and masked results stay retrievable", async () => {
  const { engine, messages, turn, read } = run();
  for (let index = 0; index < 8; index++) await turn(page(index));
  const view = await engine.transform(messages);
  const results = view.filter((message) => message.role === "toolResult");
  assert.equal(resultText(results.at(-1)), page(7));
  const masked = results.filter((message) =>
    resultText(message).startsWith("[Older output masked"),
  );
  assert.ok(masked.length > 0, "older outputs were masked");
  const handle = handleIn(resultText(masked[0]));
  const stored = await read(handle);
  assert.ok(stored.endsWith(page(0).slice(0, 17_000)));
});

test("the request prefix stays byte-identical between turns", async () => {
  const { engine, messages, turn } = run();
  let previous: AgentMessage[] = [];
  let changed = 0;
  for (let index = 0; index < 14; index++) {
    await turn(page(index, 2_500));
    const view = await engine.transform(messages);
    const same = previous.every(
      (message, position) =>
        JSON.stringify(message) === JSON.stringify(view[position]),
    );
    if (!same) changed++;
    previous = view;
  }
  // Masking rewrites the prefix only in rare batches, never every turn.
  assert.ok(changed <= 2, `prefix changed ${changed} times`);
});

test("an identical read on an unchanged page returns a short reference", async () => {
  const { engine, turn } = run();
  const first = await turn("same page", { tabId: 1 });
  assert.equal(first, "same page");
  const repeat = await engine.acceptToolOutput({
    toolCallId: "again",
    toolName: "snapshot",
    input: { tabId: 1, call: 1 },
    text: "same page",
    repeatable: true,
  });
  assert.match(repeat, /^Unchanged since art-/);
  const changed = await engine.acceptToolOutput({
    toolCallId: "changed",
    toolName: "snapshot",
    input: { tabId: 1, call: 1 },
    text: "new page",
    repeatable: true,
  });
  assert.equal(changed, "new page");
});

test("compaction keeps tool declarations and recent turns and folds earlier summaries", async () => {
  const { engine, messages, turn, summaries } = run(12_000);
  for (let index = 0; index < 30; index++) {
    await turn(page(index, 1_500), {}, "note ".repeat(400));
    await engine.transform(messages);
  }
  const view = await engine.transform(messages);
  assert.ok(summaries.length >= 2, "compacted more than once");
  assert.match(summaries.at(-1) || "", /<previous_summary>\nsummary/);
  assert.equal(view[0].role, "system");
  assert.ok(view[0].role === "system" && view[0].toolsAdded?.length);
  assert.ok(
    view.some(
      (message) =>
        message.role === "user" &&
        String(message.content).includes(`summary ${summaries.length}`),
    ),
  );
  assert.equal(resultText(view.at(-1)), page(29, 1_500));
});

const imageCount = (view: AgentMessage[]) =>
  view.flatMap((message) =>
    message.role === "toolResult"
      ? message.content.filter((part) => part.type === "image")
      : [],
  ).length;

test("only the newest screenshot stays; older ones become a note", async () => {
  const { engine, messages, turn } = run();
  await turn("first", {}, "", "screenshot", true);
  await turn("second", {}, "", "screenshot", true);
  const view = await engine.transform(messages);
  assert.equal(imageCount(view), 1);
  assert.match(JSON.stringify(view), /earlier image was removed/);
});

test("every screenshot of the latest parallel batch reaches the model", async () => {
  const { engine, messages, turn } = run();
  await turn("older", {}, "", "screenshot", true);
  messages.push({
    ...assistantMessage(model),
    content: [1, 2].map((tabId) => ({
      type: "toolCall" as const,
      id: `shot-${tabId}`,
      name: "screenshot",
      arguments: { tabId },
    })),
  });
  for (const tabId of [1, 2])
    messages.push({
      role: "toolResult",
      toolCallId: `shot-${tabId}`,
      toolName: "screenshot",
      content: [
        { type: "text", text: `Tab ${tabId}` },
        { type: "image", data: "AA==", mimeType: "image/png" },
      ],
      isError: false,
      timestamp: 0,
    });
  assert.equal(imageCount(await engine.transform(messages)), 2);
});

test("old editPage arguments shrink with the masking batch, newer ones stay", async () => {
  const { engine, messages, turn } = run();
  const translation = "Übersetzter Absatz ".repeat(200);
  await turn(
    "Applied 1 of 1 edits.",
    { edits: [{ op: "setText", ref: "e1", text: translation }] },
    "",
    "editPage",
  );
  for (let index = 0; index < 8; index++) await turn(page(index));
  await turn(
    "Applied 1 of 1 edits.",
    { edits: [{ op: "setText", ref: "e2", text: translation }] },
    "",
    "editPage",
  );
  const view = JSON.stringify(await engine.transform(messages));
  assert.equal(view.split(translation).length - 1, 1);
  assert.match(view, /chars, already applied/);
});

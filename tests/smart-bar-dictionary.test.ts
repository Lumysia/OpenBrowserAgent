import assert from "node:assert/strict";
import { test } from "node:test";
import { smartBarPrompt } from "../src/background/smart-bar/prompts";
import { parseJsonPrefix } from "../src/shared/json-prefix";
import {
  dictionaryPlainText,
  isShortSelection,
  readDictionaryAnswer,
  smartBarResultFormat,
} from "../src/shared/smart-bar-dictionary";

test("short selections: words and short phrases in any script", () => {
  for (const text of [
    "serendipity",
    "ran",
    "  “break the ice,”  ",
    "kick the bucket",
    "New York Times",
    "U.S.",
    "state-of-the-art",
    "rock 'n' roll",
    "Schadenfreude",
    "Handschuh.",
    "pomme de terre",
    "sobremesa",
    "saudade",
    "机器学习",
    "画蛇添足",
    "猫の手も借りたい",
    "木漏れ日",
    "カタカナ",
    "눈치",
    "잘 먹겠습니다",
    "ChatGPT 模型",
  ])
    assert.equal(isShortSelection(text), true, text);
  for (const text of [
    "",
    "   ",
    "42",
    "—",
    "The quick brown fox jumps.",
    "one two three four five",
    "Wait! Stop",
    "Done. Next",
    "She ran home.",
    "Is it?",
    "好。",
    "它是一个非常复杂的问题",
    "今日はとても良い天気ですね",
    "我很好。你呢",
    "line one\nline two",
    "a".repeat(41),
    "Ich weiß nicht, was soll es bedeuten",
  ])
    assert.equal(isShortSelection(text), false, JSON.stringify(text));
});

test("only Translate on a short selection asks for a dictionary entry", () => {
  assert.equal(smartBarResultFormat("translate", "serendipity"), "dictionary");
  assert.equal(smartBarResultFormat("explain", "serendipity"), "text");
  assert.equal(
    smartBarResultFormat("translate", "The quick brown fox jumps."),
    "text",
  );
  const word = smartBarPrompt("translate", "ran", "zh-CN", {
    before: "She ",
    after: " home.",
  });
  assert.match(word.system, /JSON object/);
  assert.match(word.prompt, /entry language is Chinese \(China\)/);
  assert.match(word.prompt, /"contextMeaning"/);
  assert.match(word.prompt, /She \[\[SELECTION\]\] home\./);
  const sentence = smartBarPrompt("translate", "She ran home.", "zh-CN");
  assert.match(sentence.prompt, /^Translate the text below into Chinese/);
  assert.doesNotMatch(sentence.system, /JSON/);
  assert.match(
    smartBarPrompt("explain", "ran", "en-US").prompt,
    /^Explain the text below/,
  );
});

const ENTRY = {
  headword: "run",
  pronunciation: "/rʌn/",
  partOfSpeech: "动词",
  contextMeaning: "跑，奔跑",
  otherMeanings: ["经营", "运行"],
  examples: [
    { text: "She runs every morning.", translation: "她每天早上跑步。" },
  ],
  synonyms: ["sprint"],
  translation: "跑",
};

test("dictionary answers: plain, fenced, or with text around them", () => {
  const plain = readDictionaryAnswer(JSON.stringify(ENTRY), true);
  assert.equal(plain.kind, "entry");
  const fenced = readDictionaryAnswer(
    "```json\n" + JSON.stringify(ENTRY, null, 2) + "\n```",
    true,
  );
  assert.deepEqual(fenced, plain);
  const wrapped = readDictionaryAnswer(
    `Here it is: ${JSON.stringify(ENTRY)} Hope this helps.`,
    true,
  );
  assert.deepEqual(wrapped, plain);
  assert.equal(plain.kind === "entry" && plain.entry.translation, "跑");
});

test("dictionary answers: optional fields may be missing or malformed", () => {
  const reading = readDictionaryAnswer(
    JSON.stringify({
      headword: "Zugspitze",
      contextMeaning: "德国最高的山",
      otherMeanings: "not a list",
      examples: ["Wir wandern auf die Zugspitze.", { translation: "no text" }],
      synonyms: [1, " ", "Gipfel"],
    }),
    true,
  );
  assert.deepEqual(reading, {
    kind: "entry",
    entry: {
      headword: "Zugspitze",
      pronunciation: undefined,
      partOfSpeech: undefined,
      contextMeaning: "德国最高的山",
      otherMeanings: [],
      examples: [{ text: "Wir wandern auf die Zugspitze." }],
      synonyms: ["Gipfel"],
      collocations: [],
      translation: undefined,
    },
  });
});

test("dictionary answers: invalid JSON falls back to plain text", () => {
  assert.deepEqual(readDictionaryAnswer("短暂的；转瞬即逝的", true), {
    kind: "text",
    text: "短暂的；转瞬即逝的",
  });
  const broken = "{headword: ephemeral, translation: 短暂的}";
  assert.deepEqual(readDictionaryAnswer(broken, true), {
    kind: "text",
    text: broken,
  });
  // No headword: no card, but the translation is still there.
  assert.deepEqual(readDictionaryAnswer('{"translation": "短暂的"}', true), {
    kind: "text",
    text: "短暂的",
  });
});

test("dictionary answers read while they stream", () => {
  const full = "```json\n" + JSON.stringify(ENTRY);
  assert.deepEqual(readDictionaryAnswer("", false), { kind: "pending" });
  assert.deepEqual(readDictionaryAnswer("``", false), { kind: "pending" });
  assert.deepEqual(readDictionaryAnswer("```json\n{", false), {
    kind: "pending",
  });
  assert.deepEqual(readDictionaryAnswer('{"headw', false), {
    kind: "pending",
  });
  // Plain text streams as text, as today.
  assert.deepEqual(readDictionaryAnswer("短暂", false), {
    kind: "text",
    text: "短暂",
  });
  // Every prefix reads without throwing; once the headword is in, it is a
  // card that only grows.
  let sawEntry = false;
  for (let end = 1; end <= full.length; end++) {
    const reading = readDictionaryAnswer(full.slice(0, end), false);
    if (sawEntry) assert.equal(reading.kind, "entry", full.slice(0, end));
    sawEntry ||= reading.kind === "entry";
  }
  const cut = readDictionaryAnswer(
    '{"headword":"run","otherMeanings":["经营","运',
    false,
  );
  assert.equal(cut.kind, "entry");
  assert.deepEqual(cut.kind === "entry" && cut.entry.otherMeanings, [
    "经营",
    "运",
  ]);
});

test("JSON prefixes close open strings and drop dangling parts", () => {
  const value = (text: string) => {
    const parsed = parseJsonPrefix(text);
    return parsed.kind === "value" ? parsed.value : parsed.kind;
  };
  assert.deepEqual(value('{"a": 1, "b'), { a: 1 });
  assert.deepEqual(value('{"a": 1, "b":'), { a: 1 });
  assert.deepEqual(value('{"a": tru'), {});
  assert.deepEqual(value('{"a": "x\\'), { a: "x" });
  assert.deepEqual(value('{"a": "x\\u00'), { a: "x" });
  assert.deepEqual(value('{"a": [{"t": "}"}, {"t'), { a: [{ t: "}" }, {}] });
  assert.deepEqual(value('{"a": "b"}\n```'), { a: "b" });
  assert.equal(value("Sure! {"), "none");
});

test("a dictionary entry copies as plain text", () => {
  const reading = readDictionaryAnswer(JSON.stringify(ENTRY), true);
  assert.equal(reading.kind, "entry");
  if (reading.kind !== "entry") return;
  assert.equal(
    dictionaryPlainText(reading.entry, {
      inContext: "在此语境中",
      examples: "例句",
      synonyms: "同义词",
      collocations: "常用搭配",
    }),
    [
      "run  /rʌn/  动词",
      "1. (在此语境中) 跑，奔跑",
      "2. 经营",
      "3. 运行",
      "例句:",
      "- She runs every morning. (她每天早上跑步。)",
      "同义词: sprint",
    ].join("\n"),
  );
});

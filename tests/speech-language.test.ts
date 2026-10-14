import assert from "node:assert/strict";
import { test } from "node:test";
import {
  languageDetect,
  type LanguageDetectorApi,
} from "../src/shared/language-detector";
import { smartBarTranslationLanguage } from "../src/shared/smart-bar";
import {
  charScript,
  languageScript,
  pickDetection,
  scriptRuns,
  speechPieces,
  type DetectLanguage,
} from "../src/shared/speech-language";
import {
  chooseVoice,
  missingVoiceLanguages,
} from "../src/shared/speech-voices";
import {
  readResultPieces,
  readSourcePieces,
  type ReadAloudInput,
} from "../src/smart-bar/ui/read-aloud";

const runs = (text: string) =>
  scriptRuns(text).map(({ text, script }) => [text.trim(), script]);

// A detector that knows a few phrases and is unsure about the rest.
const detector =
  (known: Record<string, string>): DetectLanguage =>
  async (text) => {
    const language = Object.entries(known).find(([phrase]) =>
      text.includes(phrase),
    )?.[1];
    return language
      ? [{ detectedLanguage: language, confidence: 0.9 }]
      : [{ detectedLanguage: "en", confidence: 0.2 }];
  };

test("scripts are told apart by their characters", () => {
  assert.equal(charScript("中"), "han");
  assert.equal(charScript("か"), "kana");
  assert.equal(charScript("カ"), "kana");
  assert.equal(charScript("한"), "hangul");
  assert.equal(charScript("Ж"), "cyrillic");
  assert.equal(charScript("λ"), "greek");
  assert.equal(charScript("ب"), "arabic");
  assert.equal(charScript("ש"), "hebrew");
  assert.equal(charScript("ก"), "thai");
  assert.equal(charScript("क"), "devanagari");
  assert.equal(charScript("é"), "latin");
  assert.equal(charScript("7"), undefined);
  assert.equal(charScript(" "), undefined);
  assert.equal(languageScript("zh-TW"), "han");
  assert.equal(languageScript("ja"), "kana");
  assert.equal(languageScript("sr-Latn"), "latin");
  assert.equal(languageScript("uk"), "cyrillic");
  assert.equal(languageScript("fr-FR"), "latin");
});

test("mixed text splits where the script changes, if it matters", () => {
  assert.deepEqual(runs("我喜欢 machine learning 这个领域。"), [
    ["我喜欢", "han"],
    ["machine learning", "latin"],
    ["这个领域。", "han"],
  ]);
  // A single acronym, a short word or a number stays in the sentence.
  assert.deepEqual(runs("我用 API 调用了 3 次 ok。"), [
    ["我用 API 调用了 3 次 ok。", "han"],
  ]);
  // Kanji next to kana are Japanese.
  assert.deepEqual(runs("私は漢字を勉強します。"), [
    ["私は漢字を勉強します。", "kana"],
  ]);
  assert.deepEqual(runs('He said "你好吗" to me.'), [
    ['He said "', "latin"],
    ['你好吗"', "han"],
    ["to me.", "latin"],
  ]);
  assert.deepEqual(runs("안녕하세요, 반갑습니다."), [
    ["안녕하세요, 반갑습니다.", "hangul"],
  ]);
  assert.deepEqual(runs("Привет, как дела?"), [
    ["Привет, как дела?", "cyrillic"],
  ]);
  // A short lead-in joins what follows.
  assert.deepEqual(runs("OK 好的，没问题。"), [["OK 好的，没问题。", "han"]]);
  assert.deepEqual(runs("  42  "), [["42", undefined]]);
  assert.deepEqual(runs("   "), []);
});

test("each piece gets a language from its script and the hints", async () => {
  const pieces = (text: string, hints: string[], detect?: DetectLanguage) =>
    speechPieces([{ text, hints }], detect);
  // Chinese takes the hint's region.
  assert.deepEqual(await pieces("今天天气很好。", ["fr", "zh-TW"]), [
    { text: "今天天气很好。", lang: "zh-TW" },
  ]);
  assert.deepEqual(await pieces("今天天气很好。", ["en-US"]), [
    { text: "今天天气很好。", lang: "zh" },
  ]);
  assert.deepEqual(await pieces("私は学生です。", ["ja-JP"]), [
    { text: "私は学生です。", lang: "ja-JP" },
  ]);
  assert.deepEqual(await pieces("Привет, как дела?", ["en"]), [
    { text: "Привет, как дела?", lang: "ru" },
  ]);
  assert.deepEqual(await pieces("Привіт, як справи?", ["en", "uk-UA"]), [
    { text: "Привіт, як справи?", lang: "uk-UA" },
  ]);
  // Latin script: the detector when it is sure, with the hint's region.
  const detect = detector({ Bonjour: "fr", Hello: "en" });
  assert.deepEqual(
    await pieces("Bonjour tout le monde.", ["en-US", "fr-CA"], detect),
    [{ text: "Bonjour tout le monde.", lang: "fr-CA" }],
  );
  // Unsure, unavailable or failing: the first Latin-script hint, else English.
  assert.deepEqual(await pieces("Guten Tag.", ["zh-CN", "de-DE"], detect), [
    { text: "Guten Tag.", lang: "de-DE" },
  ]);
  assert.deepEqual(await pieces("Guten Tag.", ["de-DE"]), [
    { text: "Guten Tag.", lang: "de-DE" },
  ]);
  assert.deepEqual(
    await pieces("Guten Tag.", ["de"], () => Promise.reject(new Error())),
    [{ text: "Guten Tag.", lang: "de" }],
  );
  assert.deepEqual(await pieces("Hello there.", ["zh-CN", "ja"]), [
    { text: "Hello there.", lang: "en" },
  ]);
  // Hints that are no language tags are skipped.
  assert.deepEqual(await pieces("Hello there.", ["not a tag", "en_GB"]), [
    { text: "Hello there.", lang: "en-GB" },
  ]);
});

test("mixed pieces are read in order", async () => {
  assert.deepEqual(
    await speechPieces([
      {
        text: "The word 散步 means a walk. 我们去散步吧。",
        hints: ["en-GB"],
      },
    ]),
    [
      { text: "The word", lang: "en-GB" },
      { text: "散步", lang: "zh" },
      { text: "means a walk.", lang: "en-GB" },
      { text: "我们去散步吧。", lang: "zh" },
    ],
  );
});

test("detector results count only when sure and in Latin script", () => {
  assert.equal(
    pickDetection([
      { detectedLanguage: "es", confidence: 0.3 },
      { detectedLanguage: "pt", confidence: 0.65 },
    ]),
    "pt",
  );
  assert.equal(
    pickDetection([{ detectedLanguage: "fr", confidence: 0.4 }]),
    undefined,
  );
  assert.equal(
    pickDetection([{ detectedLanguage: "und", confidence: 0.99 }]),
    undefined,
  );
  assert.equal(
    pickDetection([{ detectedLanguage: "ja", confidence: 0.99 }]),
    undefined,
  );
  assert.equal(pickDetection(undefined), undefined);
});

test("the browser detector is used only when it is ready", async () => {
  const calls: string[] = [];
  let availability = "downloadable";
  const api: LanguageDetectorApi = {
    availability: async () => {
      calls.push("availability");
      return availability;
    },
    create: async () => {
      calls.push("create");
      return {
        detect: async () => [{ detectedLanguage: "fr", confidence: 0.9 }],
      };
    },
  };
  const detect = languageDetect(() => api);
  assert.equal(await detect("Bonjour"), undefined);
  // Never downloads the model: no create() while it isn't available.
  assert.deepEqual(calls, ["availability"]);
  availability = "available";
  assert.deepEqual(await detect("Bonjour"), [
    { detectedLanguage: "fr", confidence: 0.9 },
  ]);
  await detect("Salut");
  // Created once, then reused.
  assert.deepEqual(calls, ["availability", "availability", "create"]);
  assert.equal(await languageDetect(() => undefined)("Bonjour"), undefined);
});

test("voices: the exact tag, then the same language, else none", () => {
  const voice = (
    name: string,
    lang: string,
    localService = true,
    isDefault = false,
  ) => ({ name, lang, localService, default: isDefault });
  const voices = [
    voice("US network", "en-US", false, true),
    voice("UK", "en-GB"),
    voice("US local", "en-US"),
    voice("Hong Kong", "zh-HK"),
    voice("Taiwan", "zh-TW"),
    voice("China", "zh-CN"),
    voice("Russian", "ru_RU"),
  ];
  assert.equal(chooseVoice(voices, "en-US")?.name, "US local");
  assert.equal(chooseVoice(voices, "en-GB")?.name, "UK");
  assert.equal(chooseVoice(voices, "en-AU")?.name, "UK");
  assert.equal(chooseVoice(voices, "en")?.name, "US local");
  // Plain Chinese is Mandarin in simplified script; zh-Hant prefers Taiwan.
  assert.equal(chooseVoice(voices, "zh")?.name, "China");
  assert.equal(chooseVoice(voices, "zh-TW")?.name, "Taiwan");
  assert.equal(chooseVoice(voices, "zh-Hant")?.name, "Taiwan");
  assert.equal(chooseVoice(voices, "ru")?.name, "Russian");
  assert.equal(chooseVoice(voices, "ja"), undefined);
  assert.deepEqual(
    missingVoiceLanguages(voices, ["en-US", "ja", "ja-JP", "zh", "ko"]),
    ["ja", "ko"],
  );
  // No voice list at all: nothing to tell.
  assert.deepEqual(missingVoiceLanguages([], ["ja"]), []);
});

const input = (change: Partial<ReadAloudInput>): ReadAloudInput => ({
  action: "translate",
  source: "今天天气很好，我们去公园散步吧。",
  output: { write: "" },
  languages: { page: "en", reply: "en-US", ui: "en-US" },
  ...change,
});

test("translations are read in their target language", async () => {
  // The target is the reply language, not the UI language.
  assert.equal(smartBarTranslationLanguage("de-DE", "zh"), "de-DE");
  assert.equal(smartBarTranslationLanguage("de-DE", "de"), "en");
  assert.deepEqual(
    await readResultPieces(
      input({
        output: { write: "Das Wetter ist schön." },
        languages: { page: "zh-CN", reply: "de-DE", ui: "en-US" },
      }),
    ),
    [{ text: "Das Wetter ist schön.", lang: "de-DE" }],
  );
  // Text already in the reply language becomes English.
  assert.deepEqual(
    await readResultPieces(
      input({
        source: "Bonjour tout le monde, comment allez-vous ?",
        output: { write: "Hello everyone, how are you?" },
        languages: { page: "fr", reply: "fr-FR", ui: "fr-FR" },
      }),
      detector({ Bonjour: "fr" }),
    ),
    [{ text: "Hello everyone, how are you?", lang: "en" }],
  );
  // The source is detected from its text; the page language is a hint.
  assert.deepEqual(await readSourcePieces(input({})), [
    { text: "今天天气很好，我们去公园散步吧。", lang: "zh" },
  ]);
});

test("edits keep the source language as hint", async () => {
  assert.deepEqual(
    await readResultPieces(
      input({
        action: "fixGrammar",
        source: "Ich habe ein Hund.",
        output: { write: "Ich habe einen Hund." },
        languages: { page: "de", reply: "en-US", ui: "en-US" },
      }),
    ),
    [{ text: "Ich habe einen Hund.", lang: "de" }],
  );
});

test("a dictionary entry is read part by part, in card order", async () => {
  const pieces = await readResultPieces(
    input({
      source: "serendipity",
      output: {
        write: "意外发现",
        entry: {
          headword: "serendipity",
          pronunciation: "/ˌserənˈdɪpəti/",
          partOfSpeech: "名词",
          contextMeaning: "意外发现珍宝的运气",
          otherMeanings: [],
          examples: [
            {
              text: "Finding that café was pure serendipity.",
              translation: "找到那家咖啡馆纯属偶然。",
            },
          ],
          synonyms: ["chance", "fluke"],
          collocations: [],
          translation: "意外发现",
        },
      },
      languages: { page: "en-GB", reply: "zh-CN", ui: "zh-CN" },
    }),
  );
  assert.deepEqual(pieces, [
    { text: "serendipity", lang: "en-GB" },
    { text: "名词", lang: "zh-CN" },
    { text: "意外发现珍宝的运气", lang: "zh-CN" },
    { text: "Finding that café was pure serendipity.", lang: "en-GB" },
    { text: "找到那家咖啡馆纯属偶然。", lang: "zh-CN" },
    { text: "chance, fluke", lang: "en-GB" },
  ]);
});

test("kanji-only text follows a Japanese hint", async () => {
  assert.deepEqual(
    await speechPieces([{ text: "勉強", hints: ["ja-JP", "zh-CN"] }]),
    [{ text: "勉強", lang: "ja-JP" }],
  );
  assert.deepEqual(
    await speechPieces([{ text: "学习很重要", hints: ["zh-CN"] }]),
    [{ text: "学习很重要", lang: "zh-CN" }],
  );
});

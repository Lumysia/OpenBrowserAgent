import assert from "node:assert/strict";
import { test } from "node:test";
import { createQueue, PRIORITY } from "../src/page-translate/queue";
import { translationCacheKey } from "../src/shared/page-translate/cache";
import {
  engineLanguageCode,
  sameLanguage,
} from "../src/shared/page-translate/languages";
import {
  createMarkedStreamParser,
  markItems,
} from "../src/shared/page-translate/marked-stream";
import {
  parsePlaceholders,
  stripPlaceholders,
  tokenizePlaceholders,
} from "../src/shared/page-translate/placeholders";
import {
  DEFAULT_PAGE_TRANSLATE_SETTINGS,
  normalizePageTranslateSettings,
  pageTranslateTarget,
} from "../src/shared/page-translate/settings";
import { mergePreferences } from "../src/shared/default-preferences";

test("placeholders: pairs nest, atoms stand alone, models' spacing is tolerated", () => {
  const source = "See <b1>the <b2>guide</b2></b1> and {3}.";
  assert.deepEqual(
    parsePlaceholders(source, "Voir <b1>le <b2>guide</b2></b1> et {3}."),
    [
      { type: "text", value: "Voir " },
      {
        type: "element",
        id: 1,
        children: [
          { type: "text", value: "le " },
          {
            type: "element",
            id: 2,
            children: [{ type: "text", value: "guide" }],
          },
        ],
      },
      { type: "text", value: " et " },
      { type: "atom", id: 3 },
      { type: "text", value: "." },
    ],
  );
  // Reordered pairs are fine; spaces inside markers too.
  assert.ok(
    parsePlaceholders(source, "{ 3 } et < b1 >le <b2>guide</b2></ b1>"),
  );
  // Missing, extra, duplicated or crossed markers are not.
  for (const wrong of [
    "Voir le guide et {3}.",
    "Voir <b1>le <b2>guide</b2></b1> et {3} {4}.",
    "<b1>le</b1> <b1>guide</b1> <b2></b2> {3}",
    "<b1>le <b2>guide</b1></b2> {3}",
    "<b1>le <b2>guide</b2> {3}",
  ])
    assert.equal(parsePlaceholders(source, wrong), undefined, wrong);
  assert.equal(
    stripPlaceholders("A <b1>b</b1> {2}", () => "c"),
    "A b c",
  );
  assert.deepEqual(tokenizePlaceholders("x{1}"), [
    { type: "text", value: "x" },
    { type: "atom", id: 1 },
  ]);
});

test("[[n]] format: items marked by number", () => {
  assert.equal(
    markItems([
      { id: 4, text: "One" },
      { id: 9, text: "Two <b1>x</b1>" },
    ]),
    "[[4]]\nOne\n[[9]]\nTwo <b1>x</b1>\n[[end]]",
  );
});

test("[[n]] parser: items complete when the next header arrives", () => {
  const parser = createMarkedStreamParser();
  const seen: Array<{ id: number; text: string }> = [];
  // Closures: an assertion on `seen` narrows its type at the call site.
  const push = (chunk: string) => seen.push(...parser.push(chunk));
  const end = () => seen.push(...parser.end());
  push("Sure! Here is the translation:\n```\n[[2]]\nDeux");
  assert.deepEqual(seen, []);
  assert.deepEqual(parser.partial(), { id: 2, text: "Deux" });
  push(" lignes\nsur deux\n[[");
  // The half-written header isn't shown as text.
  assert.deepEqual(parser.partial(), { id: 2, text: "Deux lignes\nsur deux" });
  push("1]]\nUn\n");
  assert.deepEqual(seen, [{ id: 2, text: "Deux lignes\nsur deux" }]);
  push("[[3]] Trois sur la même ligne\n[[end]]\n```\nAnything after.");
  end();
  assert.deepEqual(seen, [
    { id: 2, text: "Deux lignes\nsur deux" },
    { id: 1, text: "Un" },
    { id: 3, text: "Trois sur la même ligne" },
  ]);
  assert.equal(parser.partial(), undefined);
});

test("[[n]] parser: missing [[end]], missing and repeated items", () => {
  const parser = createMarkedStreamParser();
  const items = [
    ...parser.push("[[1]]\nUn\n[[1]]\nEncore un\n[[3]]\n\n[[4]]\nQuatre"),
    ...parser.end(),
  ];
  // Item 2 is missing, item 3 empty, item 1's repeat ignored; the last item
  // ends with the stream.
  assert.deepEqual(items, [
    { id: 1, text: "Un" },
    { id: 4, text: "Quatre" },
  ]);
});

test("queue: on screen first, page order, small first batch, size limits", () => {
  const queue = createQueue();
  const limits = { concurrency: 4, maxItems: 3, maxChars: 30, firstItems: 2 };
  queue.set({ id: 1, text: "a".repeat(10), priority: PRIORITY.near });
  queue.set({ id: 5, text: "b".repeat(10), priority: PRIORITY.visible });
  queue.set({ id: 3, text: "c".repeat(10), priority: PRIORITY.visible });
  queue.set({ id: 2, text: "d".repeat(25), priority: PRIORITY.near });
  queue.set({ id: 4, text: "e".repeat(50), priority: PRIORITY.near });
  queue.set({ id: 6, text: "f".repeat(5), priority: PRIORITY.near });
  const ids = (first = false) =>
    queue.take(limits, first).map((item) => item.id);
  assert.deepEqual(ids(true), [3, 5]);
  // 10 + 25 chars is over 30: the batch stops before item 2.
  assert.deepEqual(ids(), [1]);
  assert.deepEqual(ids(), [2]);
  // Longer than a batch: alone.
  assert.deepEqual(ids(), [4]);
  queue.set({ id: 6, text: "f".repeat(5), priority: PRIORITY.visible });
  assert.deepEqual(ids(), [6]);
  assert.equal(queue.size, 0);
});

test("settings: defaults, cleaned values, the target language", () => {
  assert.deepEqual(
    mergePreferences({}).pageTranslate,
    DEFAULT_PAGE_TRANSLATE_SETTINGS,
  );
  // Written by the last release: no pageTranslate key.
  assert.deepEqual(
    mergePreferences({ autoScroll: false }).pageTranslate,
    DEFAULT_PAGE_TRANSLATE_SETTINGS,
  );
  assert.deepEqual(
    normalizePageTranslateSettings({
      engine: "unknown-engine" as never,
      display: "both" as never,
      modelId: 3 as never,
      targetLanguage: "fr_FR",
      translateMenus: "yes" as never,
    }),
    {
      engine: "browser",
      modelId: "",
      targetLanguage: "fr-FR",
      display: "bilingual",
      translateMenus: false,
      videoButton: true,
    },
  );
  // Settings stored before the video button existed get it, on.
  assert.equal(
    normalizePageTranslateSettings({ engine: "google", translateMenus: true })
      .videoButton,
    true,
  );
  // The browser's translator is the default; an engine already stored stays.
  assert.equal(DEFAULT_PAGE_TRANSLATE_SETTINGS.engine, "browser");
  assert.equal(normalizePageTranslateSettings({}).engine, "browser");
  assert.equal(
    mergePreferences({
      pageTranslate: { ...DEFAULT_PAGE_TRANSLATE_SETTINGS, engine: "model" },
    }).pageTranslate?.engine,
    "model",
  );
  // Settings saved by the last release have no translateMenus.
  assert.equal(
    normalizePageTranslateSettings({ engine: "google", display: "translation" })
      .translateMenus,
    false,
  );
  const target = (targetLanguage: string, ui: string) =>
    pageTranslateTarget(
      { ...DEFAULT_PAGE_TRANSLATE_SETTINGS, targetLanguage },
      ui,
    );
  assert.equal(target("", "zh-TW"), "zh-TW");
  assert.equal(target("", "zh-HK"), "zh-TW");
  assert.equal(target("", "zh-CN"), "zh-CN");
  assert.equal(target("", "ja-JP"), "ja");
  assert.equal(target("", "pt-BR"), "pt-BR");
  assert.equal(target("de", "ja-JP"), "de");
  assert.equal(target("fr-CA", "en-US"), "fr");
  assert.equal(target("", "tlh"), "en");
});

test("languages: each engine's codes", () => {
  assert.equal(engineLanguageCode("google", "zh-CN"), "zh-CN");
  assert.equal(engineLanguageCode("microsoft", "zh-TW"), "zh-Hant");
  assert.equal(engineLanguageCode("browser", "zh-TW"), "zh-Hant");
  assert.equal(engineLanguageCode("google", "he"), "iw");
  assert.equal(engineLanguageCode("browser", "fa"), undefined);
  assert.ok(sameLanguage("zh-Hans", "zh-CN"));
  assert.ok(!sameLanguage("zh-Hant", "zh-CN"));
  assert.ok(sameLanguage("en-US", "en"));
  assert.ok(!sameLanguage(undefined, "en"));
});

test("cache keys: engine, language and text each matter", async () => {
  const key = (engine: string, target: string, text: string) =>
    translationCacheKey(engine, target, text);
  const base = await key("google", "fr", "Hello");
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(await key("google", "fr", "Hello"), base);
  for (const other of await Promise.all([
    key("microsoft", "fr", "Hello"),
    key("google", "de", "Hello"),
    key("google", "fr", "Hello!"),
    key("googlefr", "", "Hello"),
  ]))
    assert.notEqual(other, base);
});

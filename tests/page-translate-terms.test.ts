import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTermMemory,
  TERM_EXAMPLES_MAX,
  TERM_MEMORY_NAMES,
} from "../src/background/page-translate/term-memory";
import { modelPrompt } from "../src/background/page-translate/engines/model";
import { addsLittle, metadataOf } from "../src/page-translate/metadata";
import {
  isNameLike,
  isNameList,
  nameRuns,
} from "../src/shared/page-translate/names";

test("names: runs of capitalized words in a sentence", () => {
  assert.deepEqual(
    nameRuns(
      "Trump ousts Kimberly Guilfoyle as US ambassador to Greece. Pope Leo XIV thanks “Vatican News”.",
    ),
    ["Kimberly Guilfoyle", "US", "Greece", "Pope Leo XIV", "Vatican News"],
  );
  assert.deepEqual(nameRuns("没有大写字母的文字"), []);
  assert.equal(isNameLike("The New York Times"), true);
  assert.equal(isNameLike("Bank of America"), true);
  assert.equal(isNameLike("Picks for you"), false);
  assert.equal(isNameLike("Top stories"), false);
  assert.equal(isNameList("By Ann Lee, Bo Chan Jr. & Cy Dee"), true);
  assert.equal(isNameList("By Ann Lee, Bo Chan and Cy Dee"), true);
  assert.equal(
    isNameList("Kimberly Guilfoyle Resigns as Ambassador to Greece"),
    false,
  );
});

test("metadata: dates, relative times, numbers and names, in the page's language", () => {
  const kinds = (texts: string[], language?: string) =>
    texts.map((text) => metadataOf(text, language) ?? null);
  assert.deepEqual(
    kinds([
      "3 hours ago",
      "Yesterday",
      "Wednesday, October 14",
      "Oct 7, 2026",
      "16°C",
      "1,234",
      "CTV News",
      "By Tyler Pager",
      "11Alive.com",
      "Your briefing",
      "See more headlines & perspectives",
      "A storm hit the coast on Monday.",
    ]),
    [
      "date",
      "date",
      "date",
      "date",
      "number",
      "number",
      "name",
      "name",
      "name",
      null,
      null,
      null,
    ],
  );
  assert.deepEqual(kinds(["il y a 3 heures", "mercredi 14 octobre"], "fr"), [
    "date",
    "date",
  ]);
  // Not a language the browser knows: English formats.
  assert.equal(metadataOf("2 days ago", "not a tag"), "date");
});

test("metadata: a label with a number, numbers with footnote marks, rows of labels", () => {
  assert.deepEqual(
    [
      "Coordinates: 27°59′18″N 86°55′31″E / 27.98833°N 86.92528°E",
      "8,848.86 m (29,031.7 ft)[note 2]",
      "Updated: Oct 7, 2026",
      "Ranked 1st",
      "Note: the pass closes in winter",
      "Chapter 5: Into the valley",
      "new | past | comments | ask",
      "126 points by ann 1 hour ago | hide | 29 comments",
      "Home › News › World",
      "A long headline about the storm on the coast | Exclusive",
      "83.4k stars",
      "+ 726 releases",
      "and",
      "Ten tips for the pass",
      "Modified 1 month ago",
      "Viewed 2.0m times",
    ].map((text) => metadataOf(text) ?? null),
    [
      "number",
      "number",
      "number",
      "number",
      null,
      null,
      "name",
      "name",
      "name",
      null,
      "number",
      "number",
      "name",
      null,
      "number",
      "number",
    ],
  );
});

test("adds little: only the labels of copied values translated", () => {
  assert.equal(addsLittle("Nepali: सगरमाथा", "尼泊尔语：सगरमाथा"), true);
  assert.equal(
    addsLittle("Standard Tibetan: ཇོ་མོ་གླང་མ", "标准藏语：ཇོ་མོ་གླང་མ"),
    true,
  );
  assert.equal(addsLittle("सगरमाथा (Nepali)", "सगरमाथा（尼泊尔语）"), true);
  // Names kept inside a real translation.
  assert.equal(addsLittle("Paris Agreement", "Accord de Paris"), false);
  assert.equal(addsLittle("Note: see Paris", "Remarque : voir Paris"), false);
  assert.equal(addsLittle("Nepali: Sagarmatha", "尼泊尔语：萨加玛塔"), false);
  // No word in the translation.
  assert.equal(
    addsLittle("-5% with 5 percent savings $24.69", "-5% $24.69"),
    true,
  );
});

test("term memory: earlier translations with the same names go with later batches", () => {
  const memory = createTermMemory();
  memory.remember(
    "<b1>Kimberly Guilfoyle</b1> resigns as US ambassador to Greece",
    "<b1>金伯利·吉尔福伊尔</b1>辞去美国驻希腊大使职务",
  );
  memory.remember("A sentence without names.", "一个没有名字的句子。");
  assert.deepEqual(
    memory.examples(["Why Kimberly Guilfoyle left", "No names here"]),
    [
      {
        source: "Kimberly Guilfoyle resigns as US ambassador to Greece",
        translation: "金伯利·吉尔福伊尔辞去美国驻希腊大使职务",
      },
    ],
  );
  // The same text isn't its own example.
  assert.deepEqual(
    memory.examples(["Kimberly Guilfoyle resigns as US ambassador to Greece"]),
    [],
  );
  assert.deepEqual(memory.examples(["Nothing known"]), []);

  // Bounded: at most so many examples per batch, and names per page.
  for (let index = 0; index < TERM_MEMORY_NAMES + 20; index++)
    memory.remember(`Today in Town${index}`, `今天在 Town${index}`);
  const batch = Array.from(
    { length: 20 },
    (_, index) => `News from Town${TERM_MEMORY_NAMES + index}`,
  );
  assert.equal(memory.examples(batch).length, TERM_EXAMPLES_MAX);
  assert.deepEqual(memory.examples(["News from Town0"]), []);
});

test("term memory: in the model's prompt only when there are examples", () => {
  const items = [{ id: 1, text: "Why Kimberly Guilfoyle left" }];
  const plain = modelPrompt({ items, target: "zh-CN" });
  const withTerms = modelPrompt({
    items,
    target: "zh-CN",
    terms: [
      {
        source: "Kimberly Guilfoyle resigns",
        translation: "金伯利·吉尔福伊尔辞职",
      },
    ],
  });
  assert.equal(withTerms.system, plain.system);
  assert.doesNotMatch(plain.prompt, /Earlier translations/);
  assert.match(
    withTerms.prompt,
    /Earlier translations on this page[^\n]*\n- Kimberly Guilfoyle resigns\n {2}金伯利·吉尔福伊尔辞职\n\n\[\[1\]\]/,
  );
});

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
  const kinds = (texts: string[], language = "en", label = false) =>
    texts.map((text) => metadataOf(text, { language, label }) ?? null);
  assert.deepEqual(
    kinds([
      "3 hours ago",
      "Yesterday",
      "Wednesday, October 14",
      "Oct 7, 2026",
      "16°C",
      "1,234",
      "example.com",
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
      null,
      null,
      null,
    ],
  );
  // Dates and relative times in other languages, from the browser's formats.
  assert.deepEqual(kinds(["il y a 3 heures", "mercredi 14 octobre"], "fr"), [
    "date",
    "date",
  ]);
  assert.deepEqual(kinds(["3小时前", "10月14日星期三"], "zh-CN"), [
    "date",
    "date",
  ]);
  // Not a language tag: the user's languages, never one assumed language.
  assert.equal(
    metadataOf("2 days ago", { language: "not a tag" }),
    metadataOf("2 days ago", { language: undefined }),
  );
});

test("metadata: names and counts only where the page sets the text apart as a label", () => {
  const kinds = (texts: string[], label: boolean, name = false) =>
    texts.map(
      (text) => metadataOf(text, { language: "en", label, name }) ?? null,
    );
  // The same shapes are sentences in running text: a title-case phrase, a
  // German noun, a number of things.
  const shapes = [
    "Ann Lee",
    "By Ann Lee, Bo Chan and Cy Dee",
    "Privacy Policy",
    "Datenschutz",
    "3 new messages",
    "12 replies",
  ];
  assert.deepEqual(kinds(shapes, false), [null, null, null, null, null, null]);
  // A label (a link's whole text) has numbers of things; a capitalized name
  // only where the page marks a name (an author, a byline): a link's
  // title-case headline has the same shape.
  assert.deepEqual(kinds(shapes, true), [
    null,
    null,
    null,
    null,
    "number",
    "number",
  ]);
  assert.deepEqual(kinds(shapes, true, true), [
    "name",
    "name",
    "name",
    "name",
    "number",
    "number",
  ]);
  // A number in the language's compact notation is a statistic anywhere.
  assert.deepEqual(
    ["12.5K followers", "1.8M views", "3 new messages"].map(
      (text) => metadataOf(text, { language: "en" }) ?? null,
    ),
    ["number", "number", null],
  );
  assert.equal(metadataOf("1.2万次观看", { language: "zh-CN" }), "number");
  assert.equal(metadataOf("3,4 Mio. Aufrufe", { language: "de" }), "number");
});

test("metadata: a label with a number, numbers with footnote marks, rows of labels", () => {
  assert.deepEqual(
    [
      "Coordinates: 27°59′18″N 86°55′31″E / 27.98833°N 86.92528°E",
      "8,848.86 m (29,031.7 ft)[note 2]",
      "Updated: Oct 7, 2026",
      "Note: the pass closes in winter",
      "Chapter 5: Into the valley",
      "Chapter 5",
      "Released 2024",
      "Updated yesterday",
      "home | archive | about",
      "12 points by ann 1 hour ago | hide | 3 comments",
      "Home › News › World",
      "一个关于海岸风暴的很长的新闻标题 | 独家",
      "A long headline about the storm on the coast | Exclusive",
      "Ten tips for the pass",
    ].map((text) => metadataOf(text, { language: "en" }) ?? null),
    [
      "number",
      "number",
      "number",
      null,
      null,
      null,
      null,
      null,
      "name",
      "name",
      "name",
      null,
      null,
      null,
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

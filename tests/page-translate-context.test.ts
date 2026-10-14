import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { parsePage } from "./linkedom-page";
import { modelPrompt } from "../src/background/page-translate/engines/model";
import { walkParagraphs, type Paragraph } from "../src/page-translate/blocks";
import {
  batchContext,
  pageDescription,
  roleOf,
} from "../src/page-translate/context";
import type { Unit } from "../src/page-translate/units";
import {
  boundedContext,
  clipContext,
  PAGE_TRANSLATE_CONTEXT_LIMITS,
  PAGE_TRANSLATE_ROLE,
} from "../src/shared/page-translate/context";

// The page's paragraphs as units, in page order, by their element's id.
function unitsOf(html: string) {
  const { document } = parsePage(html);
  const paragraphs = [
    ...walkParagraphs(document.body, { translateMenus: true }),
  ].filter((paragraph): paragraph is Paragraph => !!paragraph);
  const units = paragraphs.map(
    (paragraph, index) => ({ id: index + 1, paragraph }) as Unit,
  );
  const byId = (id: string) => {
    const unit = units.find(
      ({ paragraph }) => (paragraph.wrapper ?? paragraph.parent).id === id,
    );
    assert.ok(unit, `no paragraph #${id}`);
    return unit;
  };
  return { units, byId };
}

test("context: each item's role from the page's structure", () => {
  const { byId } = unitsOf(`
    <nav><a id="menu" href="/news">News</a></nav>
    <article>
      <h2 id="heading">Weather this week</h2>
      <div role="heading" aria-level="3" id="aria-heading">Monday</div>
      <p id="body">Rain is expected in the <a href="/hills">hills</a> all day.</p>
      <button id="button">Show the forecast</button>
      <div role="tablist"><div role="tab" id="tab">Hourly</div></div>
      <figure><img src="a.png"><figcaption id="caption">The valley at dawn</figcaption></figure>
      <dl><dt id="term">Wind speed</dt><dd id="value">Strong from the west in the afternoon.</dd></dl>
      <div class="card"><div id="label">Category</div><div id="more">A long description that is running text.</div></div>
    </article>`);
  const roles = Object.fromEntries(
    [
      "menu",
      "heading",
      "aria-heading",
      "body",
      "button",
      "tab",
      "caption",
      "term",
      "value",
      "label",
      "more",
    ].map((id) => [id, roleOf(byId(id).paragraph) ?? "text"]),
  );
  assert.deepEqual(roles, {
    menu: PAGE_TRANSLATE_ROLE.menu,
    heading: PAGE_TRANSLATE_ROLE.heading,
    "aria-heading": PAGE_TRANSLATE_ROLE.heading,
    body: "text",
    button: PAGE_TRANSLATE_ROLE.button,
    tab: PAGE_TRANSLATE_ROLE.menu,
    caption: PAGE_TRANSLATE_ROLE.caption,
    term: PAGE_TRANSLATE_ROLE.label,
    value: "text",
    label: PAGE_TRANSLATE_ROLE.label,
    more: "text",
  });
});

test("context: the section headings and the text just before a batch", () => {
  const { units, byId } = unitsOf(`
    <nav><a id="nav" href="/">Home page</a></nav>
    <h1 id="h1">Field notes</h1>
    <h2 id="old">Spring</h2>
    <p id="spring">Snow melts in the spring.</p>
    <h2 id="h2">Summer</h2>
    <h3 id="h3">July</h3>
    <p id="intro">The trail opens in July.</p>
    <p id="first">Bring water for the day.</p>
    <p id="second">Tell someone where you go.</p>
    <p id="echo">Rain falls in the evening.</p>
    <p id="later">Rain falls in the evening.</p>`);
  const context = (...ids: string[]) =>
    batchContext(
      ids.map((id) => byId(id)),
      units,
    );
  // The nearest heading and the nearest higher one above it; the
  // paragraph just before. The batch's order doesn't matter.
  assert.deepEqual(context("second", "first"), {
    headings: ["Summer", "July"],
    before: "The trail opens in July.",
  });
  // A heading just before isn't repeated as the text before.
  assert.deepEqual(context("intro"), { headings: ["Summer", "July"] });
  // Nor is a copy of an item of the batch.
  assert.deepEqual(context("later"), { headings: ["Summer", "July"] });
  assert.equal(context("echo")?.before, "Tell someone where you go.");
  // A heading in the batch is no context; a section starts at the top.
  assert.deepEqual(context("h1", "old"), undefined);
  assert.deepEqual(context("spring"), { headings: ["Field notes", "Spring"] });
  // Menus and buttons say nothing about the text after them.
  assert.equal(context("h1"), undefined);
});

test("context: bounded, cut at words", () => {
  const limits = PAGE_TRANSLATE_CONTEXT_LIMITS;
  const words = (count: number) =>
    Array.from({ length: count }, (_, index) => `word${index}`).join(" ");
  const bounded = boundedContext({
    headings: ["One", "Two", words(60)],
    before: words(100),
  })!;
  assert.equal(bounded.headings!.length, limits.headings);
  assert.equal(bounded.headings![0], "Two");
  assert.ok(bounded.headings![1].length <= limits.heading);
  assert.match(bounded.headings![1], /^word0 word1 .* word\d+…$/);
  assert.ok(bounded.before!.length <= limits.before);
  assert.match(bounded.before!, /^…word\d+ .* word99$/);
  assert.equal(boundedContext({ headings: [" "], before: "" }), undefined);
  assert.equal(clipContext("  Short   text ", 50), "Short text");
});

test("context: the page's description from its metadata", () => {
  const page = (head: string) =>
    parseHTML(`<!doctype html><html><head>${head}</head><body></body></html>`)
      .document as unknown as Document;
  assert.equal(
    pageDescription(
      page(
        `<meta property="og:description" content="Shared"><meta name="description" content=" Notes from a  walk. ">`,
      ),
    ),
    "Notes from a walk.",
  );
  assert.equal(
    pageDescription(page(`<meta property="og:description" content="Shared">`)),
    "Shared",
  );
  assert.equal(pageDescription(page("")), undefined);
  const long = pageDescription(
    page(`<meta name="description" content="${"long words ".repeat(80)}">`),
  )!;
  assert.ok(long.length <= PAGE_TRANSLATE_CONTEXT_LIMITS.description);
});

test("AI model prompt: context is reference in the user prompt, the system prompt doesn't change", () => {
  const items = [
    { id: 4, text: "Weather this week", role: PAGE_TRANSLATE_ROLE.heading },
    { id: 5, text: "Rain is expected in the <b1>hills</b1>." },
    { id: 6, text: "Show more", role: PAGE_TRANSLATE_ROLE.button },
  ];
  const plain = modelPrompt({ items, target: "zh-CN", pageTitle: "Notes" });
  const full = modelPrompt({
    items,
    target: "zh-CN",
    pageTitle: "Notes",
    pageDescription: "A walker's notes.",
    context: {
      headings: ["Field notes", "Summer"],
      before: "The trail opens.",
    },
    terms: [{ source: "Summer hills", translation: "夏日山丘" }],
  });
  assert.equal(full.system, plain.system);
  assert.match(full.system, /reference only/);
  assert.equal(
    full.prompt,
    [
      "Page title: Notes",
      "Page description: A walker's notes.",
      "Section: Field notes › Summer",
      "Just before the items: The trail opens.",
      "Roles: item 4 is a heading, item 6 is a button",
      "",
      "Earlier translations on this page. Write the names in them the same way:",
      "- Summer hills",
      "  夏日山丘",
      "",
      "[[4]]",
      "Weather this week",
      "[[5]]",
      "Rain is expected in the <b1>hills</b1>.",
      "[[6]]",
      "Show more",
      "[[end]]",
    ].join("\n"),
  );
  // Without any context, the items alone.
  assert.equal(
    modelPrompt({ items: [{ id: 1, text: "Hello" }], target: "fr" }).prompt,
    "[[1]]\nHello\n[[end]]",
  );
});

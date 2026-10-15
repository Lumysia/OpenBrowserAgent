import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePage } from "./linkedom-page";
import {
  walkParagraphs,
  type Paragraph,
  type WalkOptions,
} from "../src/page-translate/blocks";
import { roleOf } from "../src/page-translate/context";
import { controlOf } from "../src/page-translate/dom-rules";
import { isQuestion } from "../src/shared/text";
import { PAGE_TRANSLATE_ROLE } from "../src/shared/page-translate/context";

function paragraphsOf(html: string, options?: WalkOptions) {
  const { document } = parsePage(html);
  return [...walkParagraphs(document.body, options)].filter(
    (paragraph): paragraph is Paragraph => !!paragraph,
  );
}

const texts = (html: string, options?: WalkOptions) =>
  paragraphsOf(html, options).map((paragraph) => paragraph.source.plain);

test("controls: a label that reads as a sentence or a question is content", () => {
  const page = `
    <main>
      <div class="faq">
        <h3 class="hidden-title">How many saves can I upload?</h3>
        <button class="title" data-target="#saves">How many saves can I upload?</button>
        <div class="body"><p>You can store up to 5 saves.</p></div>
      </div>
      <button>我可以上传多少个存档？</button>
      <div role="button">Tell me how the storage of saves works</div>
      <button>Read more</button>
      <button>Log in</button>
      <button aria-haspopup="menu">Choose which notifications you want to receive</button>
      <div role="dialog"><button>Accept all cookies and continue to the site</button></div>
    </main>`;
  // The same with menus and buttons translated or not: these are content.
  const content = [
    "How many saves can I upload?",
    "How many saves can I upload?",
    "You can store up to 5 saves.",
    "我可以上传多少个存档？",
    "Tell me how the storage of saves works",
  ];
  assert.deepEqual(texts(page), content);
  assert.deepEqual(texts(page, { translateMenus: true }), [
    ...content,
    "Read more",
    "Log in",
    "Choose which notifications you want to receive",
    "Accept all cookies and continue to the site",
  ]);
  // Content is placed and described as a title, not as a control.
  const [, question] = paragraphsOf(page);
  assert.equal(question.parent.localName, "button");
  assert.equal(question.inline, false);
  assert.equal(controlOf(question.parent), null);
  assert.equal(roleOf(question), PAGE_TRANSLATE_ROLE.heading);
  const more = paragraphsOf(page, { translateMenus: true }).find(
    (paragraph) => paragraph.source.plain === "Read more",
  )!;
  assert.equal(controlOf(more.parent), more.parent);
  assert.equal(roleOf(more), PAGE_TRANSLATE_ROLE.button);
});

test("controls: titles of sections that open and close are content", () => {
  const page = `
    <main>
      <details><summary id="summary">Shipping</summary><p>Within three days.</p></details>
      <h3><button id="accordion" aria-expanded="false" aria-controls="returns">Returns</button></h3>
      <div id="returns" role="region"><p>Within thirty days.</p></div>
      <div class="row">
        <button id="toggle" aria-expanded="true">Payment</button>
        <div><p>By card or transfer.</p></div>
      </div>
      <h2>Release notes <button aria-expanded="false" aria-controls="x">Edit</button></h2>
      <div id="x"><p>Editing the notes.</p></div>
      <p>The full story, cut short.</p>
      <button aria-expanded="false">Show more</button>
      <button aria-expanded="false" aria-controls="menu">Menu</button>
      <ul id="menu" role="menu"><li role="menuitem">Settings</li></ul>
      <button aria-expanded="false">Sections</button>
      <div><nav><a href="/a">First</a></nav></div>
      <details><summary aria-haspopup="menu">Code</summary><div>Clone</div></details>
    </main>`;
  const found = paragraphsOf(page);
  assert.deepEqual(
    found.map((paragraph) => paragraph.source.plain),
    [
      "Shipping",
      "Within three days.",
      "Returns",
      "Within thirty days.",
      "Payment",
      "By card or transfer.",
      "Release notes",
      "Editing the notes.",
      "The full story, cut short.",
      "Clone",
    ],
  );
  // A title gets its translation on a line of its own however short.
  for (const id of ["summary", "accordion", "toggle"]) {
    const title = found.find((paragraph) => paragraph.parent.id === id)!;
    assert.equal(title.inline, false, id);
    assert.equal(roleOf(title), PAGE_TRANSLATE_ROLE.heading, id);
  }
});

test("text: a question in any script", () => {
  for (const text of [
    "How many saves can I upload?",
    "我可以上传多少个存档？",
    "هل يمكنني رفع الحفظ؟",
    "«Est-ce possible ?»",
    "Can I (really)?",
  ])
    assert.equal(isQuestion(text), true, text);
  for (const text of ["Read more", "Upload your saves.", "What? No."])
    assert.equal(isQuestion(text), false, text);
});

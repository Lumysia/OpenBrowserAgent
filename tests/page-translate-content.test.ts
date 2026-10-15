import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePage } from "./linkedom-page";
import {
  walkParagraphs,
  type Paragraph,
  type WalkOptions,
} from "../src/page-translate/blocks";
import { controlOf } from "../src/page-translate/chrome";
import { metadataOf } from "../src/page-translate/metadata";
import { buildTranslation } from "../src/page-translate/serialize";
import { readsAsSentence } from "../src/shared/text";

// What reads as content is translated wherever it is; short labels of the
// page's interface stay as they are.

function paragraphsOf(html: string, options?: WalkOptions) {
  const { document } = parsePage(html);
  const found = [...walkParagraphs(document.body, options)].filter(
    (paragraph): paragraph is Paragraph => !!paragraph,
  );
  return { document, found };
}

const texts = (html: string, options?: WalkOptions) =>
  paragraphsOf(html, options).found.map((paragraph) => paragraph.source.plain);

test("text: a sentence, a question or a few words ending like a sentence, in any script", () => {
  for (const text of [
    "Do I need an account to play?",
    "I play mostly on weekends with friends",
    "We use cookies here.",
    "点击保存按钮。",
    "Wir verwenden Cookies.",
  ])
    assert.equal(readsAsSentence(text), true, text);
  for (const text of [
    "Log in",
    "Accept",
    "Read more",
    "Save changes.",
    "Loading the page...",
    "© 2026 Example Inc.",
    "",
  ])
    assert.equal(readsAsSentence(text), false, text);
});

test("rule 1: a control inside a sentence stays in it, kept as it is", () => {
  const page = `
    <main>
      <p id="p">Press <button id="save">Save</button> to keep your changes.</p>
      <li>Item name <button>Delete</button></li>
    </main>`;
  const { document, found } = paragraphsOf(page);
  assert.deepEqual(
    found.map((paragraph) => paragraph.source.text),
    ["Press {1} to keep your changes.", "Item name"],
  );
  // The translation shows a copy of the button where the sentence has it.
  const fragment = buildTranslation(
    document,
    found[0].source,
    "Appuyez sur {1} pour garder vos changements.",
  );
  const copy = fragment.querySelector("button")!;
  assert.equal(copy.textContent, "Save");
  assert.equal(copy.id, "");
  // A button at a paragraph's edge is the page's interface: its own, and
  // translated only with menus and buttons.
  assert.deepEqual(texts(page, { translateMenus: true }), [
    "Press to keep your changes.",
    "Item name",
    "Delete",
  ]);
});

test("rule 2: headings and sentences at the page's edges, not its labels", () => {
  assert.deepEqual(
    texts(`
      <header>
        <a href="/">Acme</a>
        <h1>Build faster websites today</h1>
        <p>A toolkit that helps small teams ship sites quickly.</p>
        <p>A tagline</p>
      </header>
      <aside><p>Sidebar text</p></aside>
      <footer>
        <p>This site is not affiliated with anyone and offers no warranty.</p>
        <p>© 2026 Example Inc.</p>
        <p><a href="/p">Privacy</a> · <a href="/t">Terms</a> · <a href="/c">Contact us</a></p>
      </footer>`),
    [
      "Build faster websites today",
      "A toolkit that helps small teams ship sites quickly.",
      "This site is not affiliated with anyone and offers no warranty.",
    ],
  );
});

test("rule 3: a dialog's heading and text, not its short buttons", () => {
  const page = `
    <div role="dialog" aria-modal="true">
      <h2>What's new in version three</h2>
      <p>You can now share boards with your whole team.</p>
      <button>Accept</button>
      <button>Log in</button>
    </div>
    <dialog open><p>We use cookies to remember your settings.</p><button>OK</button></dialog>`;
  assert.deepEqual(texts(page), [
    "What's new in version three",
    "You can now share boards with your whole team.",
    "We use cookies to remember your settings.",
  ]);
  assert.deepEqual(texts(page, { translateMenus: true }), [
    "What's new in version three",
    "You can now share boards with your whole team.",
    "Accept",
    "Log in",
    "We use cookies to remember your settings.",
    "OK",
  ]);
});

test("rule 5: a link's title-case headline is text; names stay", () => {
  assert.deepEqual(
    texts(`
      <main>
        <p><a href="/x">Cross-Save Is Here</a></p>
        <ul>
          <li><a href="/g">Getting Started With Cross-Save</a></li>
          <li><a href="/n">Release Notes</a></li>
        </ul>
        <article>
          <p>The update is out for everyone.</p>
          <p><time datetime="2026-10-14">Oct 14</time></p>
          <p><a href="/news">Storm Season Starts Early</a></p>
        </article>
        <div class="byline"><a rel="author" href="/ann">Ann Lee</a></div>
        <div class="meta"><a href="/bo">Bo Chan</a> <time datetime="2026-10-14">Oct 14</time></div>
        <div><div><a href="/u/ann">Ann</a></div> and <div><a href="/u/bo">Bo</a></div></div>
        <div class="user"><img src="a.png" alt=""><a href="/kai">Kai Lee</a></div>
      </main>`),
    [
      "Cross-Save Is Here",
      "Getting Started With Cross-Save",
      "Release Notes",
      "The update is out for everyone.",
      "Storm Season Starts Early",
    ],
  );
});

test("rule 6: a number with units or currency is a number; words around one make it text", () => {
  const kinds = (values: string[]) =>
    values.map((text) => metadataOf(text, { language: "en" }) ?? null);
  assert.deepEqual(
    kinds(["Ep 12: The End", "Day 1 of 3", "Windows 11", "No. 5"]),
    [null, null, null, null],
  );
  assert.deepEqual(
    kinds(["$24.99", "7 km", "16°C", "12 GB", "USD 5", "45%", "4K", "12th"]),
    Array(8).fill("number"),
  );
  assert.equal(metadataOf("5 zł", { language: "pl" }), "number");
  // Without spaces, a number is joined to the words around it.
  assert.equal(metadataOf("6時間12分", { language: "ja" }), "number");
  assert.equal(
    metadataOf("この3年間、商品カタログを変更するたびに再構築していました。", {
      language: "ja",
    }),
    undefined,
  );
  assert.deepEqual(
    texts(`<main><p>Ep 12: The End</p><p>Day 1 of 3</p><p>$24.99</p></main>`),
    ["Ep 12: The End", "Day 1 of 3"],
  );
});

test("rule 7: tabs, options and choices whose label is content", () => {
  const page = `
    <main>
      <div role="radiogroup">
        <div role="radio">I play mostly on weekends with friends</div>
        <div role="radio">Daily</div>
      </div>
      <div role="tablist">
        <div role="tab">Do I need an account to play?</div>
        <div role="tab">Pricing</div>
      </div>
      <ul role="listbox"><li role="option">Which of these games did you finish?</li><li role="option">None</li></ul>
      <div role="switch">Email me when someone replies to my post</div>
      <div role="checkbox">Remember me</div>
    </main>`;
  const { found } = paragraphsOf(page);
  assert.deepEqual(
    found.map((paragraph) => paragraph.source.plain),
    [
      "I play mostly on weekends with friends",
      "Do I need an account to play?",
      "Which of these games did you finish?",
      "Email me when someone replies to my post",
    ],
  );
  // Content, not a control: placed like text.
  for (const paragraph of found)
    assert.equal(controlOf(paragraph.parent), null);
});

test("rule 8: hidden content is left until it shows", () => {
  const page = `
    <main>
      <div id="slide" aria-hidden="true"><h3>The second slide's headline</h3></div>
      <div hidden><p>A hidden paragraph of the carousel.</p></div>
    </main>`;
  const { document, found } = paragraphsOf(page);
  assert.deepEqual(found, []);
  const slide = document.getElementById("slide")!;
  slide.removeAttribute("aria-hidden");
  assert.deepEqual(
    [...walkParagraphs(slide)]
      .filter((paragraph) => !!paragraph)
      .map((paragraph) => paragraph!.source.plain),
    ["The second slide's headline"],
  );
  // Inside content that is still hidden, nothing.
  const hidden = document.querySelector("[hidden] p")!;
  assert.equal([...walkParagraphs(hidden)].filter(Boolean).length, 0);
});

test("rule 9: navigation entries that read as content or name a heading", () => {
  const page = `
    <main>
      <h2 id="build">How to configure the build</h2>
      <h2 id="install">Installation <a href="#install">#</a></h2>
    </main>
    <nav aria-label="On this page">
      <ul>
        <li><a href="#build">How to configure the build</a></li>
        <li><a href="#install">Installation</a></li>
        <li><a href="/blog">Read why we rebuilt the whole editor from scratch</a></li>
      </ul>
    </nav>
    <nav><a href="/">Home</a><a href="/docs">Docs</a><a href="/about">About us</a></nav>`;
  const { found } = paragraphsOf(page);
  assert.deepEqual(
    found.map((paragraph) => paragraph.source.plain),
    [
      "How to configure the build",
      "Installation #",
      "How to configure the build",
      "Installation",
      "Read why we rebuilt the whole editor from scratch",
    ],
  );
  // Entries are placed like text, menu items like controls.
  assert.equal(controlOf(found[3].parent), null);
  const menu = paragraphsOf(page, { translateMenus: true }).found;
  assert.deepEqual(
    menu.slice(5).map((paragraph) => paragraph.source.plain),
    ["Home", "Docs", "About us"],
  );
  assert.equal(controlOf(menu[5].parent), menu[5].parent);
});

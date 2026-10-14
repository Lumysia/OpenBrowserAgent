import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { walkParagraphs, type Paragraph } from "../src/page-translate/blocks";
import {
  buildTranslation,
  serializeNodes,
} from "../src/page-translate/serialize";

function paragraphsOf(html: string) {
  const { document } = parseHTML(
    `<!doctype html><html><body>${html}</body></html>`,
  );
  const found = [...walkParagraphs(document.body)].filter(
    (paragraph): paragraph is Paragraph => !!paragraph,
  );
  return { document, found };
}

const summary = (paragraph: Paragraph) => ({
  parent: paragraph.parent.id || paragraph.parent.tagName.toLowerCase(),
  text: paragraph.source.text,
  whole: paragraph.whole,
  inline: paragraph.inline,
});

test("paragraphs: deepest blocks of text, runs next to blocks", () => {
  const { found } = paragraphsOf(`
    <article id="article">
      <h1 id="title">Release notes</h1>
      <p id="intro">Read the <a href="/guide">guide</a> first.</p>
      <div id="mixed">Some loose text <em>here</em><p id="inner">An inner paragraph.</p>and a tail</div>
      <ul><li id="item">First item<ul><li id="nested">Nested item</li></ul></li></ul>
      <nav id="nav"><a href="/">Home</a></nav>
      <a id="card" href="/card"><div id="card-title">A card title</div></a>
      <button id="button">Sign in</button>
    </article>`);
  assert.deepEqual(found.map(summary), [
    { parent: "title", text: "Release notes", whole: true, inline: false },
    {
      parent: "intro",
      text: "Read the <b1>guide</b1> first.",
      whole: true,
      inline: false,
    },
    {
      parent: "mixed",
      text: "Some loose text <b1>here</b1>",
      whole: false,
      inline: false,
    },
    {
      parent: "inner",
      text: "An inner paragraph.",
      whole: true,
      inline: false,
    },
    { parent: "mixed", text: "and a tail", whole: false, inline: false },
    { parent: "item", text: "First item", whole: false, inline: false },
    { parent: "nested", text: "Nested item", whole: true, inline: false },
    { parent: "nav", text: "<b1>Home</b1>", whole: true, inline: true },
    { parent: "card-title", text: "A card title", whole: true, inline: true },
    { parent: "button", text: "Sign in", whole: true, inline: true },
  ]);
});

test("paragraphs: code, fields, hidden and no-translate content are skipped", () => {
  const { found } = paragraphsOf(`
    <pre id="pre">const x = "text in code";</pre>
    <code id="block-code">npm install something</code>
    <textarea>Text in a field</textarea>
    <input value="A value">
    <select><option>An option</option></select>
    <p translate="no">Kept as it is.</p>
    <p class="notranslate">Also kept.</p>
    <div contenteditable="true"><p>Being edited</p></div>
    <div aria-hidden="true"><p>Hidden from readers</p></div>
    <p hidden>Hidden paragraph</p>
    <div class="highlight"><span>code view</span></div>
    <script>var text = "script";</script>
    <style>p { color: red }</style>
    <p id="numbers">12 345</p>
    <p id="mail">someone@example.com</p>
    <p id="url">https://example.com/a/b</p>
    <p id="x">A</p>
    <oba-translation data-oba-translation>Our own translation</oba-translation>
    <p id="kept">This one is translated.</p>`);
  assert.deepEqual(
    found.map((paragraph) => paragraph.source.text),
    ["This one is translated."],
  );
});

test("paragraphs: inline code and images stay as atoms in the sentence", () => {
  const { found } = paragraphsOf(
    `<p id="p">Run <code>npm test</code> and see <img src="a.png" alt="chart"> the<br>result.</p>`,
  );
  assert.deepEqual(found.map(summary), [
    {
      parent: "p",
      text: "Run {1} and see {2} the{3}result.",
      whole: true,
      inline: false,
    },
  ]);
  assert.equal(found[0].source.plain, "Run and see the result.");
});

test("serialize: nested formatting, plain spans and text that looks like markers", () => {
  const { document, found } = paragraphsOf(`
    <p id="a">A <a href="/x" class="link"><strong>bold link</strong></a> and <span>plain</span> <span class="c">styled</span> text.</p>
    <p id="b">Literal <b>markers</b> like {1} and &lt;b2&gt; stay text.</p>`);
  // The link and its bold text are one pair of markers.
  assert.equal(
    found[0].source.text,
    "A <b1>bold link</b1> and plain <b2>styled</b2> text.",
  );
  const container = document.createElement("div");
  container.append(
    buildTranslation(
      document as unknown as Document,
      found[0].source,
      "Un <b1>lien gras</b1> et du texte <b2>stylé</b2>.",
    ),
  );
  assert.equal(
    container.innerHTML,
    'Un <a href="/x" class="link"><strong>lien gras</strong></a> et du texte <span class="c">stylé</span>.',
  );
  // Plain text when the page's text could be read as markers.
  assert.equal(
    found[1].source.text,
    "Literal markers like {1} and <b2> stay text.",
  );
  assert.equal(found[1].source.elements.size, 0);
});

test("restore: copies of links, bold and code around the translated words", () => {
  const { document, found } = paragraphsOf(
    `<p id="p">Read the <a id="link" href="/guide" target="_blank">guide</a> before you <strong>leave</strong>, and run <code id="code">check</code>.</p>`,
  );
  const source = found[0].source;
  assert.equal(
    source.text,
    "Read the <b1>guide</b1> before you <b2>leave</b2>, and run {3}.",
  );
  const container = document.createElement("div");
  container.append(
    buildTranslation(
      document as unknown as Document,
      source,
      "Lisez le <b1>guide</b1> avant de <b2>partir</b2> et lancez {3}.",
    ),
  );
  assert.equal(
    container.innerHTML,
    'Lisez le <a href="/guide" target="_blank">guide</a> avant de <strong>partir</strong> et lancez <code>check</code>.',
  );
  // The originals stay where they were, with their ids.
  assert.ok(document.getElementById("link"));
  assert.ok(document.getElementById("code"));
});

test("restore: a translation with wrong markers is shown as plain text", () => {
  const { document, found } = paragraphsOf(
    `<p>Read the <a href="/guide">guide</a> and run <code>check</code>.</p>`,
  );
  const render = (translation: string) => {
    const container = document.createElement("div");
    container.append(
      buildTranslation(
        document as unknown as Document,
        found[0].source,
        translation,
      ),
    );
    return container.innerHTML;
  };
  // A marker dropped, one invented, pairs crossed, a pair twice.
  // Code stays where the translation has it.
  assert.equal(
    render("Lisez le guide et lancez {2}."),
    "Lisez le guide et lancez <code>check</code>.",
  );
  assert.equal(
    render("Lisez le <b1>guide</b1> et <b3>lancez</b3> {2}."),
    "Lisez le guide et lancez <code>check</code>.",
  );
  assert.equal(
    render("<b1>Lisez {2}</b1>"),
    '<a href="/guide">Lisez <code>check</code></a>',
  );
  assert.equal(render("<b1>a</b1><b1>b</b1>{2}{2}"), "ab<code>check</code>");
  assert.equal(render("{1} Lisez"), " Lisez");
});

test("serialize: the text of nodes, whitespace collapsed", () => {
  const { document } = parseHTML(
    `<!doctype html><html><body><p id="p">  Many
      spaces   <em> inside </em>  here </p></body></html>`,
  );
  const source = serializeNodes([...document.getElementById("p")!.childNodes]);
  assert.equal(source.plain, "Many spaces inside here");
  assert.equal(source.text, "Many spaces <b1>inside</b1> here");
});

test("serialize: footnote marks and other text without letters stay as they are", () => {
  const { found } = paragraphsOf(
    `<p>Walking developed in Europe.<sup class="reference"><a href="#cite-1"><span>[</span>1<span>]</span></a></sup> It is <b>2024</b> and <a href="/x"><em>more</em> text</a>.</p>`,
  );
  assert.equal(
    found[0].source.text,
    "Walking developed in Europe.{1} It is {2} and <b3><b4>more</b4> text</b3>.",
  );
});

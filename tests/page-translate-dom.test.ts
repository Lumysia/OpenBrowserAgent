import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePage } from "./linkedom-page";
import {
  walkParagraphs,
  type Paragraph,
  type WalkOptions,
} from "../src/page-translate/blocks";
import {
  buildTranslation,
  serializeNodes,
} from "../src/page-translate/serialize";

function paragraphsOf(html: string, options?: WalkOptions) {
  const { document } = parsePage(html);
  const found = [...walkParagraphs(document.body, options)].filter(
    (paragraph): paragraph is Paragraph => !!paragraph,
  );
  return { document, found };
}

const summary = (paragraph: Paragraph) => ({
  parent: paragraph.parent.id || paragraph.parent.tagName.toLowerCase(),
  text: paragraph.source.text,
  whole: paragraph.whole,
  inline: paragraph.inline,
  ...(paragraph.wrapper && {
    wrapper: paragraph.wrapper.id || paragraph.wrapper.tagName.toLowerCase(),
  }),
});

test("paragraphs: deepest blocks of text, runs next to blocks", () => {
  const { found } = paragraphsOf(
    `
    <article id="article">
      <h1 id="title">Release notes</h1>
      <p id="intro">Read the <a href="/guide">guide</a> first.</p>
      <div id="mixed">Some loose text <em>here</em><p id="inner">An inner paragraph.</p>and a tail</div>
      <ul><li id="item">First item<ul><li id="nested">Nested item</li></ul></li></ul>
      <nav id="nav"><a href="/">Home</a></nav>
      <a id="card" href="/card"><div id="card-title">A card title</div></a>
      <button id="button">Sign in</button>
    </article>`,
    { translateMenus: true },
  );
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
    { parent: "a", text: "Home", whole: true, inline: true, wrapper: "a" },
    { parent: "card-title", text: "A card title", whole: true, inline: true },
    { parent: "button", text: "Sign in", whole: true, inline: true },
  ]);
});

test("paragraphs: text held by one element is that element's content", () => {
  const { found } = paragraphsOf(`
    <h3 id="heading"><a id="heading-link" href="/top">Top stories</a></h3>
    <div id="card">
      <span id="outer"><a id="headline" href="/s">A headline about the pass</a></span>
      <div>More about the pass</div>
    </div>
    <ul><li id="item"><a id="item-link" href="/i">Linked item</a></li></ul>
    <td-like id="cell"><br>Second line<br></td-like>
    <p id="meta">Native words<link rel="category" href="/c"> in a sentence</p>
    <td-like id="lines">First value<br> <a id="line-link" href="/l">Linked line</a></td-like>
    <p id="verse">A line of verse<br>and the next</p>
    <div id="tags"><a href="/t/a">build-tool</a> <a href="/t/b">dev server</a> · <a href="/t/c">hmr</a></div>
    <li-like id="star"><a id="star-link" href="/login">Star this repo</a><span role="tooltip" aria-hidden="true">Sign in to star</span></li-like>`);
  assert.deepEqual(found.map(summary), [
    {
      parent: "heading-link",
      text: "Top stories",
      whole: true,
      inline: false,
      wrapper: "heading-link",
    },
    {
      parent: "headline",
      text: "A headline about the pass",
      whole: true,
      inline: false,
      wrapper: "outer",
    },
    { parent: "div", text: "More about the pass", whole: true, inline: true },
    {
      parent: "item-link",
      text: "Linked item",
      whole: true,
      inline: false,
      wrapper: "item-link",
    },
    // Line breaks at a paragraph's edges aren't part of it.
    { parent: "cell", text: "Second line", whole: true, inline: true },
    // Page metadata inside the text doesn't split it.
    {
      parent: "meta",
      text: "Native words in a sentence",
      whole: true,
      inline: false,
    },
    // Lines in a box of values are paragraphs of their own; in running
    // text a line break is part of the text.
    { parent: "lines", text: "First value", whole: false, inline: false },
    {
      parent: "line-link",
      text: "Linked line",
      whole: true,
      inline: true,
      wrapper: "line-link",
    },
    {
      parent: "verse",
      text: "A line of verse{1}and the next",
      whole: true,
      inline: false,
    },
    // A row of short links is labels (none); a link before a hidden
    // tooltip holds all of the text.
    {
      parent: "star-link",
      text: "Star this repo",
      whole: true,
      inline: true,
      wrapper: "star-link",
    },
  ]);
});

test("paragraphs: the main content only, unless menus are translated too", () => {
  const page = `
    <header id="site-header"><a href="/">Site name</a><p id="tagline">A tagline</p></header>
    <nav><a href="/a">First section</a></nav>
    <div role="navigation"><a href="/b">Second section</a></div>
    <ul role="tablist"><li role="tab">Overview tab</li></ul>
    <div role="toolbar"><span>Toolbar label</span></div>
    <div role="dialog" aria-label="Cookie consent"><p>We use cookies here.</p></div>
    <div aria-modal="true"><p>Accept the cookies?</p></div>
    <dialog open aria-label="Datenschutzeinstellungen"><p>Wir verwenden Cookies.</p></dialog>
    <aside id="sidebar"><p>Sidebar text</p></aside>
    <main>
      <article>
        <header><h1 id="title">Article title</h1></header>
        <p id="body">The article's text, with a <button>Show more</button> button.</p>
        <aside id="note"><p>An aside in the article</p></aside>
        <div class="cookie-recipe"><p>Bake the cookies.</p></div>
      </article>
    </main>
    <footer><p>Footer text</p></footer>`;
  const texts = (options?: WalkOptions) =>
    paragraphsOf(page, options).found.map(
      (paragraph) => paragraph.source.plain,
    );
  assert.deepEqual(texts(), [
    "Article title",
    "The article's text, with a",
    "button.",
    "An aside in the article",
    "Bake the cookies.",
  ]);
  assert.deepEqual(texts({ translateMenus: true }), [
    "Site name",
    "A tagline",
    "First section",
    "Second section",
    "Overview tab",
    "Toolbar label",
    "We use cookies here.",
    "Accept the cookies?",
    "Wir verwenden Cookies.",
    "Sidebar text",
    "Article title",
    "The article's text, with a",
    "Show more",
    "button.",
    "An aside in the article",
    "Bake the cookies.",
    "Footer text",
  ]);
  // A change inside the page's chrome finds nothing to translate there.
  const { document } = paragraphsOf(page);
  const nav = document.querySelector("nav a")!;
  assert.equal([...walkParagraphs(nav)].filter(Boolean).length, 0);
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
    <div style="white-space: pre; font-family: ui-monospace, Menlo, monospace"><div><span>const view</span> = <span>"code"</span></div></div>
    <div role="code">A code region</div>
    <script>var text = "script";</script>
    <style>p { color: red }</style>
    <p id="numbers">12 345</p>
    <p id="mail">someone@example.com</p>
    <p id="url">https://example.com/a/b</p>
    <p id="x">A</p>
    <oba-translation data-oba-translation>Our own translation</oba-translation>
    <p id="kept">This one is translated.</p>
    <p style="white-space: pre-wrap">Verse kept in its lines.</p>
    <p style="font-family: Courier, monospace">Prose in a typewriter font.</p>`);
  // Code is told by its markup or by its look (text kept as written, in a
  // monospace font), not by the class names of a site or library.
  assert.deepEqual(
    found.map((paragraph) => paragraph.source.text),
    [
      "This one is translated.",
      "Verse kept in its lines.",
      "Prose in a typewriter font.",
    ],
  );
});

test("paragraphs: inline code stays an atom in the sentence, images and icons are left out", () => {
  const { found } = paragraphsOf(
    `<p id="p">Run <code>npm test</code> and see <img src="a.png" alt="chart"> the<br>result<svg></svg>&nbsp;<i style='font-feature-settings: "liga"'>chevron_right</i><span aria-hidden="true">›</span><span class="star"></span><i>\ue5cc</i>.</p>`,
  );
  assert.deepEqual(found.map(summary), [
    {
      parent: "p",
      text: "Run {1} and see the{2}result .",
      whole: true,
      inline: false,
    },
  ]);
  assert.equal(found[0].source.plain, "Run and see the result .");
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
  const { document } = parsePage(
    `<p id="p">  Many
      spaces   <em> inside </em>  here </p>`,
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

test("restore: form fields and images aren't copied into the translation", () => {
  const { document, found } = paragraphsOf(
    `<p><label>Your name <input value="x"></label> and <img src="a.png"> <kbd>Ctrl</kbd></p>`,
  );
  assert.equal(found[0].source.text, "<b1>Your name {2}</b1> and {3}");
  const container = document.createElement("div");
  container.append(
    buildTranslation(
      document as unknown as Document,
      found[0].source,
      "<b1>Votre nom {2}</b1> et {3}",
    ),
  );
  assert.equal(
    container.innerHTML,
    "<label>Votre nom </label> et <kbd>Ctrl</kbd>",
  );
});

test("serialize: a space written as an element stays a space", () => {
  const { found } = paragraphsOf(
    `<p>See <a href="/a">one</a>,<span class="space">&nbsp;</span><a href="/b">two</a><span class="space">&nbsp;</span>and<span class="space">&nbsp;</span><a href="/c">three</a>.</p>`,
  );
  assert.equal(
    found[0].source.text,
    "See <b1>one</b1>, <b2>two</b2> and <b3>three</b3>.",
  );
});

test("paragraphs: labels are told by markup, in any script", () => {
  const { found } = paragraphsOf(`
    <article>
      <p>Privacy Policy</p>
      <p><a href="/privacy">Privacy Policy</a></p>
      <p>By <a href="/u/ann">Ann Lee</a>, <a href="/u/bo">Bo Chan</a> and <a href="/u/cy">Cy Dee</a></p>
      <div class="meta"><span>Ann Lee</span> <time datetime="2026-10-14">Oct 14</time></div>
      <p>3 new messages</p>
      <p><a href="/inbox">3 new messages</a></p>
      <div><div><a href="/u/ann">Ann</a></div> 以及 <div><a href="/u/bo">Bo</a></div></div>
      <div><a href="/a">第一篇很长的新闻标题讲述海岸上的风暴</a> <a href="/b">第二篇很长的新闻标题讲述山区的降雪</a></div>
      <div><a href="/t/rust">Rust</a> · <a href="/t/web">Web</a></div>
    </article>`);
  assert.deepEqual(
    found.map((paragraph) => paragraph.source.plain),
    [
      "Privacy Policy",
      "3 new messages",
      // Two long headlines aren't a row of short labels: words are counted
      // in scripts written without spaces too.
      "第一篇很长的新闻标题讲述海岸上的风暴 第二篇很长的新闻标题讲述山区的降雪",
    ],
  );
});

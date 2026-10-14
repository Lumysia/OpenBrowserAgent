import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { walkParagraphs, type Paragraph } from "../src/page-translate/blocks";
import { swapIn, swapOut } from "../src/page-translate/swap";

// Translation-only display puts the translation into the page's own text
// nodes and gives back exactly what the page had.
function pageOf(html: string) {
  const { document } = parseHTML(
    `<!doctype html><html><body>${html}</body></html>`,
  );
  const paragraphs = () =>
    [...walkParagraphs(document.body)].filter(
      (paragraph): paragraph is Paragraph => !!paragraph,
    );
  return { document, paragraphs };
}

test("swap: the translation in the page's text nodes, the elements kept", () => {
  const { document, paragraphs } = pageOf(
    `<p id="p">Read the <a id="link" href="/guide">field <em>guide</em></a> before you <strong>leave</strong>, and run <code>check</code>.</p>`,
  );
  const original = document.body.innerHTML;
  const [paragraph] = paragraphs();
  const link = document.getElementById("link");
  assert.equal(
    paragraph.source.text,
    "Read the <b1>field <b2>guide</b2></b1> before you <b3>leave</b3>, and run {4}.",
  );
  const swap = swapIn(
    paragraph.source,
    "Lisez le <b1>guide <b2>de terrain</b2></b1> avant de <b3>partir</b3> et lancez {4}.",
  );
  assert.equal(
    document.getElementById("p")!.innerHTML,
    'Lisez le <a id="link" href="/guide">guide <em>de terrain</em></a> avant de <strong>partir</strong> et lancez <code>check</code>.',
  );
  // The same elements, not copies.
  assert.equal(document.getElementById("link"), link);
  // The page's text is still what is found and sent.
  assert.equal(
    paragraphs()[0].source.text,
    "Read the <b1>field <b2>guide</b2></b1> before you <b3>leave</b3>, and run {4}.",
  );
  swapOut(swap);
  assert.equal(document.body.innerHTML, original);
});

test("swap: markers in another order are plain text in the first text", () => {
  const { document, paragraphs } = pageOf(
    `<p id="p">  Read the <a href="/a">guide</a> and the <a href="/b">notes</a>.  </p>`,
  );
  const original = document.body.innerHTML;
  const [paragraph] = paragraphs();
  const swap = swapIn(
    paragraph.source,
    "Lisez les <b2>notes</b2> et le <b1>guide</b1>.",
  );
  assert.equal(
    document.getElementById("p")!.innerHTML,
    '  Lisez les notes et le guide. <a href="/a"></a><a href="/b"></a>',
  );
  swapOut(swap);
  assert.equal(document.body.innerHTML, original);
});

test("swap: text where the page had none joins the nearest text", () => {
  const { document, paragraphs } = pageOf(
    `<div id="d"><a href="#content">Jump to content</a></div><p id="p"><img src="a.png">Caption</p>`,
  );
  const original = document.body.innerHTML;
  const [link, caption] = paragraphs();
  const swaps = [
    swapIn(link.source, "FR: <b1>Aller au contenu</b1> !"),
    swapIn(caption.source, "Image : {1} Légende"),
  ];
  assert.equal(
    document.getElementById("d")!.innerHTML,
    '<a href="#content">FR: Aller au contenu !</a>',
  );
  assert.equal(
    document.getElementById("p")!.innerHTML,
    '<img src="a.png">Image : Légende',
  );
  swaps.forEach(swapOut);
  assert.equal(document.body.innerHTML, original);
});

test("swap: text the page changed since stays the page's", () => {
  const { document, paragraphs } = pageOf(`<p id="p">Old text</p>`);
  const [paragraph] = paragraphs();
  const swap = swapIn(paragraph.source, "Ancien texte");
  const node = document.getElementById("p")!.firstChild as Text;
  node.data = "New text";
  swapOut(swap);
  assert.equal(document.getElementById("p")!.textContent, "New text");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { Marked, Renderer } from "marked";
import {
  applyStreamingTextRenderer,
  markdownParserOptions,
} from "../entrypoints/sidepanel/markdown-extensions";

function render(text: string, animatedFromChar?: number) {
  const renderer = new Renderer();
  if (animatedFromChar !== undefined)
    applyStreamingTextRenderer(renderer, animatedFromChar);
  return new Marked({ renderer, ...markdownParserOptions([]) }).parse(text, {
    async: false,
  });
}

for (const code of [
  "`$x$ $$y$$`",
  "    $$x$$\n",
  "```text\n$$\na+b\n\nc+d\n$$\n```",
]) {
  test(`math leaves code literal: ${JSON.stringify(code)}`, () => {
    const html = render(code);
    assert.doesNotMatch(html, /class="katex/);
    assert.match(html, /<code/);
    assert.match(html, /\$\$/);
  });
}

test("raw HTML from the model stays literal", () => {
  const html = render(
    '<input type="checkbox" checked><button data-code-index="1">fake</button>',
  );
  assert.match(html, /&lt;input/);
  assert.doesNotMatch(html, /<(input|button)\b/);
});

test("a raw tag cannot switch the lexer into raw mode for later markup", () => {
  const html = render(
    'Ready.<kbd>\n\n<button/class="x"/data-mermaid-download-url="https://evil.test/p">Download</button>\n\n<pre><a href="https://evil.test">x</a>',
  );
  assert.doesNotMatch(html, /<(button|pre|kbd)\b/);
  assert.doesNotMatch(html, /data-mermaid-download-url="/);
});

for (const text of [
  "- **First tab** is *open*.\n- [Second](https://example.test/) uses `code`.",
  'AT&amp;T &copy; 1 < 2 \\& "q"',
]) {
  test(`streamed text renders the same as settled text: ${JSON.stringify(text)}`, () => {
    const html = render(text, 2);
    assert.match(html, /class="stream-char"/);
    assert.equal(
      html.replace(/<span class="stream-char"[^>]*>(.*?)<\/span>/g, "$1"),
      render(text),
    );
  });
}

test("only characters after the streamed offset are animated", () => {
  assert.match(render("abcd", 2), /^<p>ab<span class="stream-char"[^>]*>c</);
});

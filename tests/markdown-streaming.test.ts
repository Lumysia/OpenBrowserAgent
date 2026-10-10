import assert from "node:assert/strict";
import { test } from "node:test";
import { Marked, Renderer } from "marked";
import { applyStreamingTextRenderer } from "../entrypoints/sidepanel/markdown-streaming";
import { escapeHtml } from "../entrypoints/sidepanel/markdown-extensions";

for (const text of [
  "- **First tab** is *open*.\n- [Second](https://example.test/) uses `code`.",
  "1. First\n   - **Nested** text\n2. Second",
  "> - A nested *list* inside a quote",
]) {
  test(`animated renderer uses Marked's parser receiver for ${JSON.stringify(text)}`, () => {
    const renderer = new Renderer();
    renderer.html = ({ text }) => escapeHtml(text);
    applyStreamingTextRenderer(renderer, 0);
    const parser = new Marked({ renderer });
    const html = parser.parse(text, { async: false });
    assert.match(html, /class="stream-char"/);
    assert.equal(
      html.replace(
        /<span class="stream-char" style="--char-index:\d+">([\s\S]*?)<\/span>/g,
        "$1",
      ),
      new Marked().parse(text, { async: false }),
    );
  });
}

test("animation keeps its reveal offset and bounded character count", () => {
  const renderer = new Renderer();
  applyStreamingTextRenderer(renderer, 10);
  const html = new Marked({ renderer }).parse("a".repeat(120), {
    async: false,
  });
  assert.match(html, /^<p>aaaaaaaaaa<span/);
  assert.equal((html.match(/class="stream-char"/g) || []).length, 80);
  assert.match(html, /--char-index:79/);
});

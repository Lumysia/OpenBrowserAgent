import assert from "node:assert/strict";
import { test } from "node:test";
import { Marked } from "marked";
import { markdownParserOptions } from "../entrypoints/sidepanel/markdown-extensions";

function render(text: string) {
  return new Marked(markdownParserOptions([])).parse(text, { async: false });
}

for (const formula of [
  "$$a+b$$",
  "$$\na+b\nc+d\n$$",
  "$$\na+b\n\nc+d\n$$",
  "Before\n\n$$\na+b\n\nc+d\n$$\n\nAfter",
  "$$a+\\$b$$",
]) {
  test(`display math renders across paragraph boundaries: ${JSON.stringify(formula)}`, () => {
    const html = render(formula);
    assert.equal((html.match(/class="katex-display"/g) || []).length, 1);
    assert.equal((html.match(/class="katex"/g) || []).length, 1);
  });
}

for (const code of [
  "`$x$ $$y$$`",
  "    $$x$$\n",
  "```text\n$$\na+b\n\nc+d\n$$\n```",
  "~~~text\n$$\na+b\n\nc+d\n$$\n~~~",
]) {
  test(`math leaves code literal: ${JSON.stringify(code)}`, () => {
    const html = render(code);
    assert.doesNotMatch(html, /class="katex/);
    assert.match(html, /<code/);
    assert.match(html, /\$\$/);
  });
}

test("escaped dollars stay literal and inline math retains escaped dollars", () => {
  assert.doesNotMatch(render("\\$x\\$ and \\$\\$y\\$\\$"), /class="katex/);
  assert.equal(
    (render("Inline $x+\\$y$ then $z$").match(/class="katex"/g) || []).length,
    2,
  );
});

test("raw HTML stays literal while generated task checkboxes distinguish completion", () => {
  const html = render(
    '- [x] Done\n- [ ] Pending\n\n<input type="checkbox" checked><button data-code-index="1">fake</button>',
  );
  assert.equal((html.match(/<input/g) || []).length, 2);
  assert.equal((html.match(/checked=""/g) || []).length, 1);
  assert.equal((html.match(/disabled=""/g) || []).length, 2);
  assert.match(html, /&lt;input/);
  assert.doesNotMatch(html, /<button/);
});

test("a raw tag cannot switch the lexer into raw mode for later markup", () => {
  const html = render(
    'Ready.<kbd>\n\n<button/class="x"/data-mermaid-download-url="https://evil.test/p">Download</button>\n\n<pre><a href="https://evil.test">x</a>',
  );
  assert.doesNotMatch(html, /<(button|pre|kbd)\b/);
  assert.doesNotMatch(html, /data-mermaid-download-url="/);
});

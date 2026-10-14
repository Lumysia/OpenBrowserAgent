import assert from "node:assert/strict";
import { test } from "node:test";
import { Renderer } from "marked";
import {
  splitMarkdownBlocks,
  type MarkdownBlock,
  type MarkdownBlocks,
} from "../entrypoints/sidepanel/markdown-blocks";
import {
  applyStreamingTextRenderer,
  lexMarkdown,
  renderMarkdownTokens,
  type MarkdownConfig,
} from "../entrypoints/sidepanel/markdown-engine";
import { renderMarkdownImage } from "../entrypoints/sidepanel/markdown-images";
import { getMessages } from "../src/shared/i18n";

const t = getMessages("en-US");
const config: MarkdownConfig = {
  sources: [
    {
      id: "source_1",
      kind: "page",
      title: "Pricing",
      url: "https://a.test/",
      createdAt: 1,
    },
  ],
  footnoteIdPrefix: "fn-",
  footnoteHeading: "Footnotes",
  footnoteBackLabel: "Back to {0}",
};

function renderer(animatedFromChar?: number, loadedImages: string[] = []) {
  const result = new Renderer();
  if (animatedFromChar !== undefined)
    applyStreamingTextRenderer(result, animatedFromChar);
  result.image = ({ href, title, text }) =>
    renderMarkdownImage(href, title, text, t, loadedImages);
  return result;
}

function render(text: string, animatedFromChar?: number) {
  return renderMarkdownTokens(
    config,
    lexMarkdown(config, text),
    renderer(animatedFromChar),
  );
}

const split = (text: string, streaming: boolean) =>
  splitMarkdownBlocks(config, text, streaming).blocks;

function renderBlock(block: MarkdownBlock) {
  return renderMarkdownTokens(config, block.tokens, renderer());
}

const strongs = (html: string) =>
  [...html.matchAll(/<strong>(.*?)<\/strong>/g)].map((match) => match[1]);

for (const [text, bold] of [
  ["**你好：**文字", "你好："],
  ["**注意**：这里", "注意"],
  ["这是**“引用”**测试", "“引用”"],
  ["**重要（注意）**です", "重要（注意）"],
  ["**강조:**입니다", "강조:"],
]) {
  test(`CJK emphasis next to punctuation is bold: ${text}`, () => {
    const html = render(text);
    assert.deepEqual(strongs(html), [bold]);
    assert.doesNotMatch(html, /\*\*/);
  });
}

test("CJK strikethrough next to punctuation", () => {
  assert.match(render("~~删除：~~文字"), /<del>删除：<\/del>文字/);
});

for (const text of [
  "It costs $5 and $10 per month.",
  "Plans: $5, $10 or $20.",
  "Run echo $HOME and $PATH now.",
  "Use $HOME/bin, then $PATH.",
]) {
  test(`dollar signs in prose stay text: ${text}`, () => {
    const html = render(text);
    assert.doesNotMatch(html, /class="katex/);
    assert.match(html, /\$/);
  });
}

test("prices before a formula in the same paragraph stay text", () => {
  const html = render("It costs $5 and $10, and $x^2$ is math.");
  assert.match(html, /It costs \$5 and \$10, and <span class="katex">/);
  assert.equal(html.match(/class="katex"/g)?.length, 1);
  assert.match(html, /x\^2<\/annotation>/);
});

for (const [text, formula, display] of [
  ["Euler $e^{i\\pi}+1=0$ done.", "e^{i\\pi}+1=0", false],
  ["Area $x^2$。", "x^2", false],
  ["inline $$a+b$$ here", "a+b", true],
  ["$$\n\\frac{a}{b}\n$$", "\\frac{a}{b}", true],
  ["Formula \\(a^2+b^2\\) here", "a^2+b^2", false],
  ["Then \\[x=1\\] inline", "x=1", true],
  ["\\[\n\\int_0^1 x\\,dx\n\\]", "\\int_0^1 x\\,dx", true],
] as const) {
  test(`math renders: ${JSON.stringify(text)}`, () => {
    const html = render(text);
    assert.match(html, /class="katex/);
    assert.ok(html.includes(`<annotation encoding="application/x-tex">`));
    assert.ok(html.includes(formula.replaceAll("&", "&amp;")));
    assert.equal(html.includes("katex-display"), display);
    assert.doesNotMatch(html, /\\\(|\\\[/);
  });
}

for (const code of [
  "`$x$ $$y$$ \\(z\\)`",
  "    $$x$$\n",
  "```text\n$$\na+b\n\nc+d\n$$\n\\[x\\]\n```",
]) {
  test(`math leaves code literal: ${JSON.stringify(code)}`, () => {
    const html = render(code);
    assert.doesNotMatch(html, /class="katex/);
    assert.match(html, /<code/);
    assert.match(html, /\$\$/);
  });
}

test("KaTeX does not trust links in formulas", () => {
  assert.doesNotMatch(render("$\\href{javascript:alert(1)}{x}$"), /<a /);
});

test("footnotes render as references and a list", () => {
  const html = render(
    "Text[^1] more[^note].\n\n[^1]: First.\n[^note]: Second.",
  );
  assert.match(html, /<sup><a id="fn-ref-1" href="#fn-1"[^>]*>1<\/a><\/sup>/);
  assert.match(html, /<a id="fn-ref-note" href="#fn-note"[^>]*>2<\/a>/);
  assert.match(html, /<section class="footnotes"/);
  assert.match(html, /<h2 id="fn-label" class="visually-hidden">Footnotes/);
  assert.match(html, /<li id="fn-1">\s*<p>First\./);
  assert.match(html, /aria-label="Back to 1"/);
});

test("citations become chips and unknown ids are dropped", () => {
  const html = render("See [[cite:source_1]] and [[cite:source_9]].");
  assert.match(html, /<button type="button" class="citation-chip"/);
  assert.match(html, /data-source-id="source_1" title="Pricing">1</);
  assert.doesNotMatch(html, /source_9|\[\[cite/);
});

test("remote images wait for a click; local images show", () => {
  const remote = "https://evil.test/p.png?d=SECRET";
  const html = render(`![chart](${remote})`);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /class="markdown-image-blocked"/);
  assert.match(
    html,
    new RegExp(`data-image-src="${remote.replace(/[.?]/g, "\\$&")}"`),
  );
  assert.match(html, />Load image</);
  assert.match(html, /evil\.test/);
  const loaded = renderMarkdownTokens(
    config,
    lexMarkdown(config, `![chart](${remote})`),
    renderer(undefined, [remote]),
  );
  assert.match(
    loaded,
    /<img src="https:\/\/evil\.test\/p\.png\?d=SECRET"[^>]*referrerpolicy="no-referrer"/,
  );
  for (const local of [
    "data:image/png;base64,AAAA",
    "blob:chrome-extension://id/1",
  ])
    assert.match(render(`![shot](${local})`), /<img src="(data|blob):/);
  assert.match(
    render("![x](javascript:alert(1))"),
    /<span class="markdown-image-invalid">x<\/span>/,
  );
});

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

const LONG_ANSWER = [
  "# Pricing\n\n**你好：**文字 costs $5 and $10, and $x^2$ [[cite:source_1]].[^1]",
  "1. first\n\n2. second\n\n    indented continuation\n\n3. third [docs][d]",
  "[d]: https://example.com/docs\n\n[^1]: Prices exclude tax.",
  "| a | b |\n|---|---|\n| 1 | 2 |",
  "```ts\nconst a = 1;\n\nconst b = 2;\n```",
  "$$\n\\frac{a}{b}\n$$",
  "- item *one*\n- item `two` and [a link](https://example.com/x)",
  "![chart](https://example.com/c.png)",
  "Closing **words** here.\n",
].join("\n\n");

test("blocks cover the text without gaps", () => {
  for (const streaming of [false, true]) {
    const blocks = split(LONG_ANSWER, streaming).filter(
      (block) => !block.derived,
    );
    assert.equal(blocks[0].start, 0);
    blocks
      .slice(1)
      .forEach((block, index) => assert.equal(block.start, blocks[index].end));
    assert.equal(blocks.at(-1)?.end, LONG_ANSWER.length);
  }
});

// Every reveal frame of a streamed answer: blocks that are no longer the live
// tail must already show their final HTML, and keep the same object so their
// memoized component does not render again.
function checkFrames(text: string, finalFrom = 1) {
  const final = new Map(
    split(text, false).map((block) => [block.key, renderBlock(block)]),
  );
  let previous: MarkdownBlocks | undefined;
  const finished = new Map<string, MarkdownBlock>();
  for (let length = 1; length < text.length; length++) {
    const prefix = text.slice(0, length);
    previous = splitMarkdownBlocks(config, prefix, true, previous);
    // Lexing only the new text gives what lexing the whole answer gives,
    // except that finished blocks keep ignoring a definition still streaming.
    const fresh = split(prefix, true);
    const liveText = prefix.slice(
      fresh.filter((b) => !b.derived).at(-1)!.start,
    );
    assert.deepEqual(
      previous.blocks.map((block) => block.key),
      fresh.map((block) => block.key),
    );
    if (!/^\[[^\]]+\]:/m.test(liveText))
      assert.deepEqual(
        previous.blocks.map(renderBlock),
        fresh.map(renderBlock),
        `frame ${length}: incremental blocks differ`,
      );
    if (length < finalFrom) continue;
    const blocks = previous.blocks.filter((block) => !block.derived);
    for (const block of blocks.slice(0, -1)) {
      assert.equal(
        renderBlock(block),
        final.get(block.key),
        `frame ${length}: block ${block.key} differs from the final answer`,
      );
      const seen = finished.get(block.key);
      if (seen)
        assert.equal(
          seen,
          block,
          `frame ${length}: ${block.key} rendered again`,
        );
      finished.set(block.key, block);
    }
  }
}

for (const [name, text] of Object.entries({
  unclosedFence: "Here:\n\n```python\nprint('a')\n\nprint('b')\n```\n\nAfter.",
  bold: "Some **important words** here and `code` too.\n\nNext.",
  looseOrderedList: "1. first\n\n2. second\n\n3. third\n\nAfter.",
  indentedContinuation:
    "- item one\n\n    indented continuation of item\n\n- item two\n\nAfter.",
  displayMath: "Formula:\n\n$$\n\\frac{a}{b}\n$$\n\nDone.",
  table: "| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter.",
})) {
  test(`streamed frames never change finished blocks: ${name}`, () =>
    checkFrames(text));
}

test("streamed frames never change finished blocks: long answer", () =>
  // Before their definitions are finished, references cannot resolve yet.
  checkFrames(LONG_ANSWER, LONG_ANSWER.indexOf("```ts") + 1));

test("a reference link resolves once its definition is finished", () => {
  const text =
    "Read [docs][1] first.\n\n[1]: https://example.com/docs\n\nMore.";
  const blocks = split(text.slice(0, -2), true);
  assert.match(
    renderBlock(blocks[0]),
    /<a href="https:\/\/example\.com\/docs">docs<\/a>/,
  );
});

test("the live tail repairs unfinished syntax", () => {
  const live = (text: string) => renderBlock(split(text, true).at(-1)!);
  assert.deepEqual(strongs(live("Some **important wor")), ["important wor"]);
  assert.deepEqual(strongs(live("**你好：")), ["你好："]);
  assert.match(live("An *emphasised phr"), /<em>emphasised phr<\/em>/);
  assert.match(live("Run `npm ins"), /<code>npm ins<\/code>/);
  const link = live("See [the docs](https://exam");
  assert.doesNotMatch(link, /\]\(|<a /);
  assert.match(link, /See the docs/);
  assert.match(live("```python\nprint('a')"), /<pre><code[^>]*>print/);
  // Prices are not treated as unfinished math.
  assert.doesNotMatch(live("costs $5 and"), /katex/);
  // A later list item still joins the list above it.
  assert.equal((live("1. first\n\n2").match(/<ol/g) || []).length, 1);
});

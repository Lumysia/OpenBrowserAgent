import {
  Lexer,
  Marked,
  Parser,
  Renderer,
  type Links,
  type Token,
  type TokenizerAndRendererExtension,
  type TokenizerExtension,
  type Tokens,
} from "marked";
import markedCjkFriendly from "marked-cjk-friendly";
import markedFootnote from "marked-footnote";
import markedKatex from "marked-katex-extension";
import type { ChatSource } from "../../src/shared/types";

export type MarkdownConfig = {
  sources: ChatSource[];
  // Footnote ids must be unique per message: several answers can use [^1].
  footnoteIdPrefix: string;
  footnoteHeading: string;
  footnoteBackLabel: string;
};

const KATEX_OPTIONS = {
  throwOnError: false,
  strict: "ignore",
  trust: false,
  // A `$` must be followed by a space or punctuation to close, so prices
  // such as "$5 and $10" and shell variables stay text.
  nonStandard: false,
} as const;

// A fresh Marked per lex or render: marked-footnote keeps per-parse state in
// its instance, and the citation renderer closes over the chat's sources.
function createMarked(config: MarkdownConfig) {
  return new Marked(
    // Model HTML is shown as text. Turning off Marked's HTML tokenizers (rather
    // than escaping in the renderer) also stops raw tags such as <kbd> from
    // switching the lexer into raw mode, which let later markup through.
    { tokenizer: { html: () => undefined, tag: () => undefined } },
    markedCjkFriendly(),
    markedKatex(KATEX_OPTIONS),
    {
      extensions: [
        dollarInlineMath,
        bracketBlockMath,
        bracketInlineMath,
        citation(config),
      ],
    },
    // Registered last so its block tokenizer runs first: it relies on owning
    // the first token of the document.
    markedFootnote({
      prefixId: config.footnoteIdPrefix,
      description: config.footnoteHeading,
      backRefLabel: config.footnoteBackLabel,
      headingClass: "visually-hidden",
    }),
  );
}

// Block and inline tokens for `text`. `links` seeds reference definitions
// from the rest of the document when only a part of it is lexed.
export function lexMarkdown(
  config: MarkdownConfig,
  text: string,
  links?: Links,
): Token[] & { links: Links } {
  const marked = createMarked(config);
  const lexer = new Lexer(marked.defaults);
  if (links) Object.assign(lexer.tokens.links, links);
  const tokens = lexer.lex(text);
  if (marked.defaults.walkTokens)
    marked.walkTokens(tokens, marked.defaults.walkTokens);
  return tokens;
}

export function renderMarkdownTokens(
  config: MarkdownConfig,
  tokens: Token[],
  renderer: Renderer,
) {
  return Parser.parse(tokens, { ...createMarked(config).defaults, renderer });
}

const STREAM_CHAR_ANIMATION_LIMIT = 80;
// One visible character of Marked's escaped text: an entity or a code point.
const VISIBLE_CHARACTER = /&(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|\w+);|[\s\S]/gu;

// Wraps newly revealed characters in animated spans. Marked installs this
// method on its own renderer, so nested tokens must use the active receiver.
export function applyStreamingTextRenderer(
  renderer: Renderer,
  animatedFromChar: number,
) {
  let characterIndex = 0;
  let animatedIndex = 0;
  renderer.text = function (
    this: Renderer,
    token: Tokens.Text | Tokens.Escape,
  ) {
    if ("tokens" in token && token.tokens)
      return this.parser.parseInline(token.tokens);
    return Renderer.prototype.text
      .call(this, token)
      .replace(VISIBLE_CHARACTER, (character: string) => {
        if (
          characterIndex++ < animatedFromChar ||
          animatedIndex >= STREAM_CHAR_ANIMATION_LIMIT
        )
          return character;
        return `<span class="stream-char" style="--char-index:${animatedIndex++}">${character}</span>`;
      });
  };
}

// Runs before the KaTeX extension's own inline rule, whose formula may contain
// a `$`: in "costs $5 and $10, and $x$" it read "5 and $10, and $x" as one
// formula. A `$` that does not open a formula here is plain text.
const dollarInlineMath: TokenizerExtension = {
  name: "dollarInlineMath",
  level: "inline",
  tokenizer(text) {
    const dollars = /^\$+/.exec(text)?.[0];
    if (!dollars) return;
    const match =
      /^(\${1,2})(?!\$)((?:\\.|[^\\\n$])*?(?:\\.|[^\\\n$]))\1(?=[\s?!.,:？！。，：]|$)/.exec(
        text,
      );
    if (!match) return { type: "text", raw: dollars, text: dollars };
    return {
      type: "inlineKatex",
      raw: match[0],
      text: match[2].trim(),
      displayMode: match[1].length === 2,
    };
  },
};

// \( … \) and \[ … \], as many models write math. They produce the KaTeX
// extension's own tokens, so its renderers draw them.
const bracketInlineMath: TokenizerExtension = {
  name: "bracketInlineMath",
  level: "inline",
  start: (text) => text.search(/\\[([]/),
  tokenizer(text) {
    const match =
      /^\\\(((?:\\.|[^\\\n])+?)\\\)/.exec(text) ||
      /^\\\[((?:\\[^]|[^\\])+?)\\\]/.exec(text);
    if (!match?.[1].trim()) return;
    return {
      type: "inlineKatex",
      raw: match[0],
      text: match[1].trim(),
      displayMode: match[0].startsWith("\\["),
    };
  },
};

const bracketBlockMath: TokenizerExtension = {
  name: "bracketBlockMath",
  level: "block",
  tokenizer(text) {
    const match = /^ {0,3}\\\[((?:\\[^]|[^\\])+?)\\\][ \t]*(?:\n|$)/.exec(text);
    if (!match?.[1].trim()) return;
    return {
      type: "blockKatex",
      raw: match[0],
      text: match[1].trim(),
      displayMode: true,
    };
  },
};

function citation(config: MarkdownConfig): TokenizerAndRendererExtension {
  return {
    name: "citation",
    level: "inline",
    start: (text) => text.indexOf("[[cite:"),
    tokenizer(text) {
      const match = /^\[\[cite:([\w-]+)\]\]/.exec(text);
      if (match) return { type: "citation", raw: match[0], sourceId: match[1] };
    },
    renderer(token) {
      const source = config.sources.find((item) => item.id === token.sourceId);
      if (!source) return "";
      return `<button type="button" class="citation-chip" data-source-id="${escapeHtml(source.id)}" title="${escapeHtml(source.title)}">${escapeHtml(source.id.replace(/^source_/, ""))}</button>`;
    },
  };
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

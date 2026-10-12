import type { Links, Token } from "marked";
import type { Footnotes } from "marked-footnote";
import remend from "remend";
import { lexMarkdown, type MarkdownConfig } from "./markdown-engine";

export type MarkdownBlock = {
  key: string;
  // Source range in the text. The footnotes list has none of its own: it is
  // built from definitions found anywhere in the answer.
  start: number;
  end: number;
  derived: boolean;
  // Code renders differently once the answer is settled: it is highlighted,
  // and Mermaid gets a preview.
  hasCode: boolean;
  tokens: Token[];
  // Blocks with equal signatures render the same HTML.
  signature: string;
};

export type MarkdownBlocks = {
  blocks: MarkdownBlock[];
  // The finished blocks and what they were built from, for the next frame.
  finished: {
    source: string;
    blocks: MarkdownBlock[];
    links: Links;
    definitions: Definitions;
    context: string;
  };
};

type Definitions = { links: string[][]; footnotes: string[] };
const EMPTY_DEFINITIONS: Definitions = { links: [], footnotes: [] };

// remend closes unfinished syntax in the streaming tail. Rewrites that change
// how text the model already finished would read are off: raw HTML is shown
// as text, and "- > 25" or "20~25" must render as they will once complete.
const REMEND_OPTIONS = {
  linkMode: "text-only",
  htmlTags: false,
  comparisonOperators: false,
  singleTilde: false,
} as const;

const CONTINUED_AFTER_BLANK_LINE = new Set(["list", "footnote"]);

// Splits the answer into Marked's own top-level blocks. While streaming, all
// blocks but the last are final: later text cannot change them, except a link
// or footnote definition, which is part of the signature of blocks that may
// use it once the definition is final.
// With the previous frame's result, only the text after its finished blocks
// is lexed again, and unchanged blocks keep their object.
export function splitMarkdownBlocks(
  config: MarkdownConfig,
  text: string,
  streaming: boolean,
  previous?: MarkdownBlocks,
): MarkdownBlocks {
  const source = text.replace(/\r\n?/g, "\n");
  const reusable = previous?.finished;
  if (
    streaming &&
    reusable?.source &&
    // Footnote numbers and references come from one lex of the whole answer.
    !reusable.definitions.footnotes.length &&
    source.startsWith(reusable.source)
  ) {
    const base = reusable.source.length;
    const tail = lexMarkdown(config, source.slice(base), reusable.links);
    const result = assemble(
      config,
      source,
      true,
      reusable.blocks,
      reusable.definitions,
      tail,
      base,
    );
    // A finished definition can change how earlier blocks read.
    if (result.finished.context === reusable.context)
      return reuseBlocks(previous, result);
  }
  const tokens = lexMarkdown(config, source);
  return reuseBlocks(
    previous,
    assemble(config, source, streaming, [], EMPTY_DEFINITIONS, tokens, 0),
  );
}

function assemble(
  config: MarkdownConfig,
  source: string,
  streaming: boolean,
  finishedBlocks: MarkdownBlock[],
  known: Definitions,
  tokens: Token[] & { links: Links },
  base: number,
): MarkdownBlocks {
  let footnotes: Footnotes | undefined;
  const blocks: MarkdownBlock[] = [];
  let offset = base;
  for (const token of tokens) {
    if (token.type === "footnotes") {
      footnotes = token as unknown as Footnotes;
      continue;
    }
    if (!token.raw) continue;
    const start = offset;
    offset += token.raw.length;
    const last = blocks.at(-1);
    if (token.type === "space" && last) {
      last.tokens.push(token);
      last.end = offset;
    } else
      blocks.push({
        key: `block:${start}`,
        start,
        end: offset,
        derived: false,
        hasCode: false,
        tokens: [token],
        signature: "",
      });
  }

  // Lists and footnote definitions continue after a blank line, so a growing
  // tail such as "2" can still turn into their next item.
  const [open, last] = blocks.slice(-2);
  if (
    streaming &&
    open &&
    last &&
    CONTINUED_AFTER_BLANK_LINE.has(open.tokens[0].type)
  ) {
    open.tokens.push(...last.tokens);
    open.end = last.end;
    blocks.pop();
  }

  const liveIndex = streaming ? blocks.length - 1 : -1;
  const finishedTokens = blocks.flatMap((block, index) =>
    index === liveIndex ? [] : block.tokens,
  );
  const found = definitions(finishedTokens, {
    links: [...known.links],
    footnotes: [...known.footnotes],
  });
  const context = JSON.stringify(found);
  blocks.forEach((block, index) => {
    const blockText = source.slice(block.start, block.end);
    const live = index === liveIndex;
    block.signature = `${blockContext(blockText, found)}\n${live ? "live" : "final"}\n${blockText}`;
    block.hasCode = hasCode(block.tokens);
    if (!live) return;
    const repaired = remend(blockText, REMEND_OPTIONS);
    if (repaired !== blockText)
      block.tokens = lexMarkdown(config, repaired, tokens.links);
  });

  const all = [...finishedBlocks, ...blocks];
  const finished = all.slice(0, streaming ? -1 : undefined);
  // Notes appear with the references to them, once their definition is final.
  const notes = footnotes?.items.filter((item) =>
    found.footnotes.includes(item.label),
  );
  if (footnotes && notes?.length)
    all.push({
      key: "footnotes",
      start: offset,
      end: offset,
      derived: true,
      hasCode: true,
      tokens: [{ ...footnotes, items: notes } as unknown as Token],
      signature: `${context}\n${JSON.stringify(
        notes.map((item) => [item.label, item.refs.length, item.raw]),
      )}`,
    });
  return {
    blocks: all,
    finished: {
      source: source.slice(0, finished.at(-1)?.end ?? 0),
      blocks: finished,
      // Only finished definitions: a link definition still streaming would
      // otherwise keep its partial URL in the next frame.
      links: Object.fromEntries(
        found.links.map(([tag, href, title]) => [tag, { href, title }]),
      ),
      definitions: found,
      context,
    },
  };
}

// The definitions a block may refer to, so that a new definition renders
// again only the blocks that use it. Footnote numbers follow every finished
// footnote, so any block with a footnote reference depends on all of them.
function blockContext(text: string, found: Definitions) {
  const lower = text.toLowerCase();
  const links = found.links.filter(([tag]) => lower.includes(`[${tag}]`));
  const footnotes = lower.includes("[^") ? found.footnotes : [];
  return links.length || footnotes.length
    ? JSON.stringify([links, footnotes])
    : "";
}

// Link and footnote definitions, which other blocks can refer to.
function definitions(tokens: Token[], found: Definitions) {
  for (const token of tokens) {
    if (token.type === "def")
      found.links.push([token.tag, token.href, token.title]);
    else if (token.type === "footnote") found.footnotes.push(token.label);
    if ("items" in token && Array.isArray(token.items))
      definitions(token.items, found);
    if ("tokens" in token && Array.isArray(token.tokens))
      definitions(token.tokens, found);
  }
  return found;
}

function hasCode(tokens: Token[]): boolean {
  return tokens.some(
    (token) =>
      token.type === "code" ||
      ("items" in token &&
        Array.isArray(token.items) &&
        hasCode(token.items)) ||
      ("tokens" in token &&
        Array.isArray(token.tokens) &&
        hasCode(token.tokens)),
  );
}

// Keeps the previous object for every block whose signature did not change,
// so memoized block components skip rendering it again.
function reuseBlocks(
  previous: MarkdownBlocks | undefined,
  result: MarkdownBlocks,
): MarkdownBlocks {
  if (!previous) return result;
  const cached = new Map(previous.blocks.map((block) => [block.key, block]));
  const reuse = (block: MarkdownBlock) => {
    const old = cached.get(block.key);
    return old && old.signature === block.signature ? old : block;
  };
  return {
    blocks: result.blocks.map(reuse),
    finished: {
      ...result.finished,
      blocks: result.finished.blocks.map(reuse),
    },
  };
}

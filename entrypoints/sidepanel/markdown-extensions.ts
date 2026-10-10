import katex from "katex";
import type { TokenizerAndRendererExtension, Tokens } from "marked";
import type { ChatSource } from "../../src/shared/types";

export function markdownExtensions(
  sources: ChatSource[],
): TokenizerAndRendererExtension[] {
  return [
    {
      name: "displayMath",
      level: "block",
      start: (text) => text.match(/(?:^|\n) {0,3}\$\$(?!\$)/)?.index,
      tokenizer(text) {
        const opening = /^ {0,3}\$\$(?!\$)/.exec(text);
        if (!opening) return;
        const end = mathEnd(text, opening[0].length, "$$");
        if (end < 0) return;
        const trailing = /^[ \t]*(?:\n|$)/.exec(text.slice(end + 2));
        const formula = text.slice(opening[0].length, end);
        if (!trailing || !formula.trim()) return;
        return {
          type: "displayMath",
          raw: text.slice(0, end + 2 + trailing[0].length),
          formula,
          displayMode: true,
        };
      },
      renderer: renderMath,
    },
    {
      name: "math",
      level: "inline",
      start: (text) => text.indexOf("$"),
      tokenizer(text) {
        if (!text.startsWith("$")) return;
        const delimiter = text.startsWith("$$") ? "$$" : "$";
        const end = mathEnd(text, delimiter.length, delimiter);
        const formula = text.slice(delimiter.length, end);
        if (
          end >= 0 &&
          formula.trim() &&
          (delimiter === "$$" || !formula.includes("\n"))
        )
          return {
            type: "math",
            raw: text.slice(0, end + delimiter.length),
            formula,
            displayMode: delimiter === "$$",
          };
      },
      renderer: renderMath,
    },
    {
      name: "citation",
      level: "inline",
      start: (text) => text.indexOf("[[cite:"),
      tokenizer(text) {
        const match = /^\[\[cite:([\w-]+)\]\]/.exec(text);
        if (match)
          return { type: "citation", raw: match[0], sourceId: match[1] };
      },
      renderer(token) {
        const source = sources.find((item) => item.id === token.sourceId);
        if (!source) return "";
        return `<button type="button" class="citation-chip" data-source-id="${escapeHtml(source.id)}" title="${escapeHtml(source.title)}">${escapeHtml(source.id.replace(/^source_/, ""))}</button>`;
      },
    },
  ];
}

function mathEnd(text: string, start: number, delimiter: string) {
  for (let index = start; index < text.length; index++) {
    if (text[index] === "\\") {
      index++;
      continue;
    }
    if (
      text.startsWith(delimiter, index) &&
      text[index + delimiter.length] !== "$" &&
      (delimiter !== "$" || text[index - 1] !== "$")
    )
      return index;
  }
  return -1;
}

function renderMath(token: Tokens.Generic) {
  try {
    return katex.renderToString(token.formula, {
      displayMode: token.displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
  } catch {
    return escapeHtml(token.raw);
  }
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

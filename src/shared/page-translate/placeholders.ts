// The text format paragraphs are translated in. Inline elements that carry
// meaning (links, bold, …) become numbered tag pairs `<b1>…</b1>`; elements
// that must not be translated (code, images, line breaks) become `{1}`.
// Engines see no attributes: the page script rebuilds the elements from its
// own copies. Dependency-free: the page script imports this module.

export type PlaceholderToken =
  | { type: "text"; value: string }
  | { type: "open"; id: number }
  | { type: "close"; id: number }
  | { type: "atom"; id: number };

export type PlaceholderTree = Array<
  | { type: "text"; value: string }
  | { type: "atom"; id: number }
  | { type: "element"; id: number; children: PlaceholderTree }
>;

// Lenient about spaces inside markers, which some models add.
const MARKER = /<\s*(\/?)\s*b(\d+)\s*>|\{\s*(\d+)\s*\}/gi;

export const openTag = (id: number) => `<b${id}>`;
export const closeTag = (id: number) => `</b${id}>`;
export const atomTag = (id: number) => `{${id}}`;

// Whether plain text already contains something that reads as a marker.
export function hasMarkerSyntax(text: string) {
  return new RegExp(MARKER.source, "i").test(text);
}

export function tokenizePlaceholders(text: string): PlaceholderToken[] {
  const tokens: PlaceholderToken[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKER)) {
    if (match.index > last)
      tokens.push({ type: "text", value: text.slice(last, match.index) });
    if (match[3] !== undefined)
      tokens.push({ type: "atom", id: Number(match[3]) });
    else
      tokens.push({
        type: match[1] ? "close" : "open",
        id: Number(match[2]),
      });
    last = match.index + match[0].length;
  }
  if (last < text.length)
    tokens.push({ type: "text", value: text.slice(last) });
  return tokens;
}

// The markers in `text` as a sorted signature, e.g. "a2 b1" for a `<b1>` pair
// and a `{2}` atom.
function signature(tokens: PlaceholderToken[]) {
  return tokens
    .flatMap((token) =>
      token.type === "atom"
        ? [`a${token.id}`]
        : token.type === "open"
          ? [`b${token.id}`]
          : [],
    )
    .sort()
    .join(" ");
}

// The translation as a tree, when it has exactly the source's markers, each
// pair once and properly nested; undefined otherwise.
export function parsePlaceholders(
  source: string,
  translation: string,
): PlaceholderTree | undefined {
  const tokens = tokenizePlaceholders(translation);
  if (signature(tokens) !== signature(tokenizePlaceholders(source)))
    return undefined;
  const root: PlaceholderTree = [];
  const stack: Array<{ id: number; children: PlaceholderTree }> = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const children = stack.at(-1)?.children ?? root;
    if (token.type === "text") children.push(token);
    else if (token.type === "atom") {
      if (seen.has(`a${token.id}`)) return undefined;
      seen.add(`a${token.id}`);
      children.push(token);
    } else if (token.type === "open") {
      if (seen.has(`b${token.id}`)) return undefined;
      seen.add(`b${token.id}`);
      const element = {
        type: "element" as const,
        id: token.id,
        children: [] as PlaceholderTree,
      };
      children.push(element);
      stack.push(element);
    } else {
      if (stack.at(-1)?.id !== token.id) return undefined;
      stack.pop();
    }
  }
  return stack.length ? undefined : root;
}

// The text without markers; atoms read as `atomText(id)`.
export function stripPlaceholders(
  text: string,
  atomText: (id: number) => string = () => "",
) {
  return tokenizePlaceholders(text)
    .map((token) =>
      token.type === "text"
        ? token.value
        : token.type === "atom"
          ? atomText(token.id)
          : "",
    )
    .join("");
}

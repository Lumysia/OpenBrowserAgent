// Translation-only display: the translation goes into the paragraph's own
// text nodes, so the page keeps its elements, styles and layout; no node is
// added or removed. Links,
// emphasis and code stay the page's own elements; only their text changes.
// Swapping out puts back exactly what the page had.
import {
  parsePlaceholders,
  plainText,
  type PlaceholderTree,
} from "../shared/page-translate/placeholders";
import { originalText, restoreSwapped, setSwapped } from "./originals";
import type { Serialized, SourceToken } from "./serialize";

export type Swap = { nodes: Text[] };

type Marker = { type: "open" | "close" | "atom"; id: number };
type Gap = { nodes: Text[]; depth: number; after?: Marker };

export function swapIn(source: Serialized, translation: string): Swap {
  const swap: Swap = { nodes: [] };
  const gaps = sourceGaps(source.tokens);
  const tree = source.elements.size
    ? parsePlaceholders(source.text, translation)
    : undefined;
  const texts = tree && alignedTexts(gaps, tree);
  if (texts) {
    moveHomeless(gaps, texts);
    gaps.forEach((gap, index) => fill(swap, gap, texts[index]));
  } else {
    // Markers that don't line up with the page's elements (an engine
    // reordered or dropped some): the whole translation as plain text in
    // the paragraph's first text outside them, the rest emptied.
    const plain = plainText(translation);
    const all = gaps.flatMap((gap) => gap.nodes);
    const first =
      gaps.find((gap) => !gap.depth && gap.nodes.some(hasText))?.nodes[0] ??
      all[0];
    for (const node of all)
      write(swap, node, node === first ? keepSpaces(node, node, plain) : "");
  }
  return swap;
}

export function swapOut(swap: Swap) {
  for (const node of swap.nodes) restoreSwapped(node);
  swap.nodes = [];
}

// The text nodes between markers, with the marker before each run.
function sourceGaps(tokens: SourceToken[]) {
  const gaps: Gap[] = [{ nodes: [], depth: 0 }];
  let depth = 0;
  for (const token of tokens) {
    if (token.type === "text") gaps[gaps.length - 1].nodes.push(token.node);
    else {
      if (token.type === "open") depth++;
      if (token.type === "close") depth--;
      gaps.push({ nodes: [], depth, after: token });
    }
  }
  return gaps;
}

// The translation's text between the same markers, when its markers come
// in the page's order.
function alignedTexts(gaps: Gap[], tree: PlaceholderTree) {
  const texts = [""];
  const markers: Marker[] = [];
  const visit = (nodes: PlaceholderTree) => {
    for (const node of nodes) {
      if (node.type === "text") texts[texts.length - 1] += node.value;
      else if (node.type === "atom") {
        markers.push(node);
        texts.push("");
      } else {
        markers.push({ type: "open", id: node.id });
        texts.push("");
        visit(node.children);
        markers.push({ type: "close", id: node.id });
        texts.push("");
      }
    }
  };
  visit(tree);
  if (markers.length !== gaps.length - 1) return undefined;
  const same = markers.every(
    (marker, index) =>
      marker.type === gaps[index + 1].after?.type &&
      marker.id === gaps[index + 1].after?.id,
  );
  return same ? texts : undefined;
}

// Text the translation has where the page has no text, or only spaces
// (between two images, before a field), joins the nearest text after it,
// else before it: spaces in a grid or a flex row don't show, text would.
function moveHomeless(gaps: Gap[], texts: string[]) {
  const home = (gap: Gap) => gap.nodes.some(hasText);
  gaps.forEach((gap, index) => {
    if (home(gap) || !texts[index].trim()) return;
    const next = gaps.findIndex((other, at) => at > index && home(other));
    const previous = gaps.findLastIndex(
      (other, at) => at < index && home(other),
    );
    if (next >= 0) texts[next] = texts[index].trim() + " " + texts[next];
    else if (previous >= 0) texts[previous] += " " + texts[index].trim();
    texts[index] = texts[index].replace(/\S+/g, "").replace(/\s+/g, " ");
  });
}

function fill(swap: Swap, gap: Gap, text: string) {
  if (!gap.nodes.length) return;
  const collapsed = text.replace(/\s+/g, " ");
  const [first] = gap.nodes;
  const last = gap.nodes[gap.nodes.length - 1];
  const core = collapsed.trim();
  for (const node of gap.nodes)
    write(
      swap,
      node,
      node !== first
        ? ""
        : core
          ? keepSpaces(first, last, core, collapsed)
          : /\s/.test(gap.nodes.map(originalText).join(""))
            ? " "
            : "",
    );
}

// The page's spaces around the text stay (indentation, a space before a
// link); a space the translation has there is kept too.
function keepSpaces(first: Text, last: Text, core: string, text = core) {
  const lead = originalText(first).match(/^\s*/)![0];
  const trail = originalText(last).match(/\s*$/)![0];
  return (
    (lead || (/^\s/.test(text) ? " " : "")) +
    core +
    (trail || (/\s$/.test(text) ? " " : ""))
  );
}

function write(swap: Swap, node: Text, value: string) {
  const original = originalText(node);
  if (value === original) return;
  setSwapped(node, original, value);
  node.data = value;
  swap.nodes.push(node);
}

function hasText(node: Text) {
  return !!originalText(node).trim();
}

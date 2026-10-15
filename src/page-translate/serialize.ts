// A paragraph's nodes as placeholder text for the engines, and a
// translation back as nodes. Links, emphasis and code in the translation are
// copies of the page's own elements; nothing from the engine becomes markup.
import {
  atomTag,
  closeTag,
  hasMarkerSyntax,
  openTag,
  parsePlaceholders,
  tokenizePlaceholders,
  type PlaceholderTree,
} from "../shared/page-translate/placeholders";
import { compact } from "../shared/text";
import { isControl } from "./chrome";
import {
  isAtom,
  isCopiedInTranslation,
  isDecorative,
  isOwn,
  isPlainWrapper,
} from "./dom-rules";
import { originalContent, originalText } from "./originals";

export type Serialized = {
  // Placeholder text; plain text when the page's own text looks like
  // markers.
  text: string;
  // The text as it reads, to notice when the page changes it.
  plain: string;
  // Elements by marker number. A pair can stand for nested elements around
  // the same text (a link around bold text): outermost first.
  elements: Map<number, Element[]>;
  // The text nodes and markers in order, to put a translation in place of
  // the text (translation-only display).
  tokens: SourceToken[];
};

export type SourceToken =
  | { type: "text"; node: Text }
  | { type: "open" | "close" | "atom"; id: number };

const LETTER = /\p{L}/u;

export function serializeNodes(nodes: Node[]): Serialized {
  const elements = new Map<number, Element[]>();
  const tokens: SourceToken[] = [];
  let plain = "";
  let marked = "";
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const value = originalText(node as Text);
      plain += value;
      marked += value;
      tokens.push({ type: "text", node: node as Text });
      return;
    }
    if (node.nodeType !== 1 || isOwn(node)) return;
    const element = node as Element;
    // Icons and images aren't part of the text (see isDecorative).
    if (isDecorative(element)) return;
    const text = originalContent(element);
    // Code, images and controls in the sentence, and elements with nothing
    // to translate in them (footnote marks such as [1]), stay as they are.
    if (isKept(element) || (text.trim() && !LETTER.test(text))) {
      const id = elements.size + 1;
      elements.set(id, [element]);
      marked += atomTag(id);
      tokens.push({ type: "atom", id });
      // Line breaks read as spaces; marks are read as they are.
      if (element.localName === "br") plain += " ";
      else if (!isKept(element)) plain += text;
      return;
    }
    // An element holding only a space (a non-breaking space between links)
    // is a space in the sentence.
    if (!text.trim()) {
      if (text) {
        plain += " ";
        marked += " ";
      }
      return;
    }
    const chain = wrappers(element);
    if (!chain.length) {
      element.childNodes.forEach(visit);
      return;
    }
    const id = elements.size + 1;
    elements.set(id, chain);
    marked += openTag(id);
    tokens.push({ type: "open", id });
    innermost(element).childNodes.forEach(visit);
    marked += closeTag(id);
    tokens.push({ type: "close", id });
  };
  nodes.forEach(visit);
  plain = compact(plain);
  // Text that already reads as markers goes as plain text.
  if (hasMarkerSyntax(plain))
    return {
      text: plain,
      plain,
      elements: new Map(),
      tokens: tokens.filter((token) => token.type === "text"),
    };
  return { text: tidyMarkers(compact(marked)), plain, elements, tokens };
}

// Atoms (see isAtom), and the page's controls inside a sentence: a
// paragraph never holds a control's label as its text (see blocks.ts).
const isKept = (element: Element) => isAtom(element) || isControl(element);

// An element and the elements nested in it around the same content, as one
// pair of markers (fewer markers translate better). Plain wrappers add
// nothing and are left out.
function wrappers(element: Element) {
  const chain: Element[] = [];
  for (let current: Element | undefined = element; current;) {
    if (!isPlainWrapper(current)) chain.push(current);
    const only = onlyChild(current);
    current =
      only && !isKept(only) && LETTER.test(originalContent(only))
        ? only
        : undefined;
  }
  return chain;
}

function innermost(element: Element) {
  let current = element;
  for (
    let only = onlyChild(current);
    only && !isKept(only) && LETTER.test(originalContent(only));
    only = onlyChild(current)
  )
    current = only;
  return current;
}

// The element's single child element when it has no other content.
function onlyChild(element: Element) {
  let only: Element | undefined;
  for (const child of element.childNodes) {
    if (child.nodeType === 3 && !originalText(child as Text).trim()) continue;
    if (child.nodeType === 8) continue;
    if (child.nodeType !== 1 || only || isOwn(child)) return undefined;
    only = child as Element;
  }
  return only;
}

// A translation whose markers don't match the source's (an engine dropped,
// invented or crossed some): plain text, with the source's atoms (code,
// images) where the translation has them, each once.
function looseTree(source: string, translation: string): PlaceholderTree {
  const atoms = new Set(
    tokenizePlaceholders(source).flatMap((token) =>
      token.type === "atom" ? [token.id] : [],
    ),
  );
  const tree: PlaceholderTree = [];
  for (const token of tokenizePlaceholders(translation))
    if (token.type === "text") tree.push(token);
    else if (token.type === "atom" && atoms.delete(token.id)) tree.push(token);
  return tree;
}

// Spaces just inside a pair move outside it.
function tidyMarkers(text: string) {
  return text
    .replace(/(<b\d+>) /g, " $1")
    .replace(/ (<\/b\d+>)/g, "$1 ")
    .replace(/ {2,}/g, " ")
    .trim();
}

// The translation as nodes for `document`. When its markers don't match the
// source's (an engine dropped or invented some), it is shown as plain text.
export function buildTranslation(
  document: Document,
  source: Serialized,
  translation: string,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const tree =
    parsePlaceholders(source.text, translation) ??
    looseTree(source.text, translation);
  appendTree(document, fragment, tree, source.elements);
  return fragment;
}

function appendTree(
  document: Document,
  parent: Node,
  tree: PlaceholderTree,
  elements: Map<number, Element[]>,
) {
  for (const node of tree) {
    if (node.type === "text") {
      parent.appendChild(document.createTextNode(node.value));
      continue;
    }
    const chain = elements.get(node.id);
    if (!chain?.length) continue;
    if (node.type === "atom" && !isCopiedInTranslation(chain[0])) continue;
    // Atoms are copied whole; pairs as empty copies around the translation.
    const made = chain.map((original) =>
      copyOf(original, node.type === "atom"),
    );
    made.reduce((outer, inner) => (outer.appendChild(inner), inner));
    if (node.type === "element")
      appendTree(document, made[made.length - 1], node.children, elements);
    parent.appendChild(made[0]);
  }
}

function copyOf(original: Element, deep: boolean) {
  const copy = original.cloneNode(deep) as Element;
  withoutIds(copy);
  copies.set(copy, original);
  return copy;
}

// Copies don't take their originals' ids (they would be duplicates).
function withoutIds(element: Element) {
  element.removeAttribute("id");
  element
    .querySelectorAll("[id]")
    .forEach((child) => child.removeAttribute("id"));
}

// The page's element each copy was made from, so clicking a copied link
// acts like clicking the original.
const copies = new WeakMap<Element, Element>();

export function originalOf(element: Element) {
  return copies.get(element);
}

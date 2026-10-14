// A paragraph's nodes as placeholder text for the engines, and a
// translation back as nodes. Links, emphasis and code in the translation are
// copies of the page's own elements; nothing from the engine becomes markup.
import {
  atomTag,
  closeTag,
  hasMarkerSyntax,
  openTag,
  parsePlaceholders,
  stripPlaceholders,
  type PlaceholderTree,
} from "../shared/page-translate/placeholders";
import { isAtom, isOwn, isPlainWrapper } from "./dom-rules";

export type Serialized = {
  // Placeholder text; plain text when the page's own text looks like
  // markers.
  text: string;
  // The text as it reads, to notice when the page changes it.
  plain: string;
  // Elements by marker number.
  elements: Map<number, Element>;
};

export function serializeNodes(nodes: Node[]): Serialized {
  const elements = new Map<number, Element>();
  let plain = "";
  let marked = "";
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const value = (node as Text).data;
      plain += value;
      marked += value;
      return;
    }
    if (node.nodeType !== 1 || isOwn(node)) return;
    const element = node as Element;
    if (isAtom(element)) {
      const id = elements.size + 1;
      elements.set(id, element);
      marked += atomTag(id);
      // Line breaks read as spaces.
      if (element.tagName.toUpperCase() === "BR") plain += " ";
      return;
    }
    if (isPlainWrapper(element) || !element.textContent?.trim()) {
      if (element.textContent?.trim()) element.childNodes.forEach(visit);
      return;
    }
    const id = elements.size + 1;
    elements.set(id, element);
    marked += openTag(id);
    element.childNodes.forEach(visit);
    marked += closeTag(id);
  };
  nodes.forEach(visit);
  const collapse = (text: string) => text.replace(/\s+/g, " ").trim();
  plain = collapse(plain);
  // Text that already reads as markers goes as plain text.
  if (hasMarkerSyntax(plain))
    return { text: plain, plain, elements: new Map() };
  return { text: tidyMarkers(collapse(marked)), plain, elements };
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
  const tree = parsePlaceholders(source.text, translation);
  if (!tree) {
    fragment.append(
      document.createTextNode(
        stripPlaceholders(translation).replace(/\s+/g, " ").trim(),
      ),
    );
    return fragment;
  }
  appendTree(document, fragment, tree, source.elements);
  return fragment;
}

function appendTree(
  document: Document,
  parent: Node,
  tree: PlaceholderTree,
  elements: Map<number, Element>,
) {
  for (const node of tree) {
    if (node.type === "text") {
      parent.appendChild(document.createTextNode(node.value));
      continue;
    }
    const original = elements.get(node.id);
    if (!original) continue;
    const copy = original.cloneNode(node.type === "atom") as Element;
    withoutIds(copy);
    copies.set(copy, original);
    if (node.type === "element")
      appendTree(document, copy, node.children, elements);
    parent.appendChild(copy);
  }
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

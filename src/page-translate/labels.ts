// Whether a paragraph is a label (see metadata.ts): the page's markup sets
// the text apart as one (link text, an author, a meta line near a date or
// a picture, a row of short links). Only reads the DOM.
import { hasTag, MEDIA_TAGS } from "../shared/dom-vocabulary";
import { wordCount } from "../shared/text";
import { isDecorative, isTextBlock } from "./dom-rules";
import { metadataOf } from "./metadata";
import { originalContent, originalText } from "./originals";

// Links, also those the page's script follows (an `a` without an address).
const LINK_SELECTOR = "a";

// What kind of label the paragraph is, if it is one (see metadata.ts): the
// page's markup says whether the text is set apart as a label.
export function labelsOf(
  parent: Element,
  nodes: Node[],
  text: string,
  wrapper: Element | undefined,
) {
  const metadata = metadataOf(text, {
    language: parent.closest("[lang]")?.getAttribute("lang") || undefined,
    label:
      !!(wrapper ?? parent).closest(LINK_SELECTOR) ||
      mostlyLinks(nodes) ||
      !!parent.closest(CITATION_SELECTOR) ||
      inDateRow(parent, text) ||
      afterPicture(nodes[0], wrapper ?? parent, text),
  });
  if (metadata) return metadata;
  // A link that is one lowercase word ("reply", "login") is an action; a
  // row of short links (tags, a menu written as links) is labels, and so is
  // a short word joining links ("and" between two authors).
  const action = !!wrapper?.matches(LINK_SELECTOR) && /^\p{Ll}+$/u.test(text);
  if (action || isLinkRow(nodes) || isJoint(nodes, wrapper, text))
    return "name";
  return undefined;
}

// Most of the letters are link text ("By <a>Ann Lee</a> and <a>Bo Chan</a>").
function mostlyLinks(nodes: Node[]) {
  let linked = 0;
  let all = 0;
  const letters = (node: Node) =>
    originalContent(node).match(/\p{L}/gu)?.length ?? 0;
  for (const node of nodes) {
    const count = letters(node);
    all += count;
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    if (element.matches(LINK_SELECTOR)) linked += count;
    else
      element
        .querySelectorAll(LINK_SELECTOR)
        .forEach((link) => (linked += letters(link)));
  }
  return all > 0 && linked * 2 >= all;
}

// Elements that name a work, its author or contact.
const CITATION_SELECTOR = "address, cite, [rel~=author], [itemprop~=author]";
// Short text near a date outside running text (a byline, the source of a
// story, its section):
// the meta lines of an item. At most this many words, and the date at most
// this many levels up.
const DATE_ROW_MAX_WORDS = 12;
const DATE_ROW_DEPTH = 3;

function inDateRow(parent: Element, text: string) {
  // Paragraphs, list items and the like are running text, not meta lines.
  if (isTextBlock(parent) || wordCount(text) > DATE_ROW_MAX_WORDS) return false;
  let row: Element | null = parent;
  for (let depth = 0; row && depth < DATE_ROW_DEPTH; depth++) {
    if (row.querySelector("time, [datetime]")) return true;
    row = row.parentElement;
  }
  return false;
}

// A short line right after a picture (a source's logo, an avatar, an
// icon) names what the picture shows. The picture is the line's previous
// sibling, or that of an element the line starts (up to this many levels).
const PICTURE_LABEL_DEPTH = 2;

function afterPicture(first: Node, element: Element, text: string) {
  if (wordCount(text) > DATE_ROW_MAX_WORDS) return false;
  if (isPicture(siblingOf(first, "previousSibling"))) return true;
  let current: Element | null = element;
  for (let depth = 0; current && depth < PICTURE_LABEL_DEPTH; depth++) {
    const previous = siblingOf(current, "previousSibling");
    if (previous) return isPicture(previous);
    current = current.parentElement;
  }
  return false;
}

// Media, or an element holding media and no text.
function isPicture(node: Node | null) {
  if (node?.nodeType !== 1) return false;
  const element = node as Element;
  if (hasTag(element, MEDIA_TAGS)) return true;
  return (
    !/\p{L}/u.test(originalContent(element)) &&
    !!element.querySelector([...MEDIA_TAGS].join(","))
  );
}

// A joining word: a word of up to this many letters between two links.
const JOINT_MAX_LETTERS = 3;

function isJoint(nodes: Node[], wrapper: Element | undefined, text: string) {
  if (wordCount(text) !== 1 || text.length > JOINT_MAX_LETTERS) return false;
  const linked = (node: Node | null) =>
    node?.nodeType === 1 &&
    ((node as Element).matches(LINK_SELECTOR) ||
      !!(node as Element).querySelector(LINK_SELECTOR));
  const first = wrapper ?? nodes[0];
  const last = wrapper ?? nodes[nodes.length - 1];
  return (
    linked(siblingOf(first, "previousSibling")) &&
    linked(siblingOf(last, "nextSibling"))
  );
}

// The nearest sibling that isn't blank text.
function siblingOf(node: Node, side: "previousSibling" | "nextSibling") {
  let sibling = node[side];
  while (sibling?.nodeType === 3 && !originalText(sibling as Text).trim())
    sibling = sibling[side];
  return sibling;
}

// Two or more links, each a short label, with nothing but spaces and
// separators between them.
const LINK_LABEL_WORDS = 4;

function isLinkRow(nodes: Node[]) {
  let links = 0;
  for (const node of nodes) {
    if (node.nodeType === 3) {
      if (/[\p{L}\d]/u.test(originalText(node as Text))) return false;
      continue;
    }
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    if (isDecorative(element)) continue;
    const link = element.matches(LINK_SELECTOR)
      ? element
      : element.querySelector(LINK_SELECTOR);
    const text = originalContent(element).trim();
    if (!link || originalContent(link).trim() !== text) return false;
    if (wordCount(text) > LINK_LABEL_WORDS) return false;
    links++;
  }
  return links > 1;
}

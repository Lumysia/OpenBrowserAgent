// Finds the page's paragraphs: the deepest elements whose content is only
// text and inline elements, and runs of text and inline elements next to
// blocks in mixed content. The DOM is not changed.
import {
  isChrome,
  isDecorative,
  isHeading,
  isInline,
  isInsideChrome,
  isOwn,
  isSkipped,
  isTextBlock,
} from "./dom-rules";
import { labelsOf } from "./labels";
import { originalText } from "./originals";
import { serializeNodes, type Serialized } from "./serialize";
import { isCodeView } from "./styles";

export type Paragraph = {
  // The nodes are consecutive children of `parent`.
  parent: Element;
  nodes: Node[];
  // The nodes are all of `parent`'s content: the translation goes at its
  // end, else right after the nodes.
  whole: boolean;
  // Short labels (menu items, table cells) get their translation on the same
  // line.
  inline: boolean;
  source: Serialized;
  // The element around all of the text and nothing else (a headline link,
  // a link alone in a list item): `parent` is inside it. The translation
  // goes after it, not into it: it isn't a second link, isn't cut by the
  // element's box and takes no part in its layout.
  wrapper?: Element;
};

// Short text in other blocks than headings and paragraphs reads inline.
const INLINE_MAX_CHARS = 24;

export type WalkOptions = {
  // Also the page's menus, buttons, navigation and footer (see isChrome).
  translateMenus?: boolean;
};

// Walks `root` (an element or an open shadow root) in document order,
// yielding each paragraph, and `undefined` after every element so the
// caller can pause between them.
export function* walkParagraphs(
  root: Element | ShadowRoot,
  options: WalkOptions = {},
): Generator<Paragraph | undefined> {
  const host =
    root.nodeType === 1 ? (root as Element) : (root as ShadowRoot).host;
  if (!options.translateMenus && isInsideChrome(host)) return;
  yield* walk(root, options);
}

function* walk(
  root: Element | ShadowRoot,
  options: WalkOptions,
): Generator<Paragraph | undefined> {
  if (root.nodeType === 1 && isSkipped(root as Element)) return;
  const parent =
    root.nodeType === 1 ? (root as Element) : (root as ShadowRoot).host;
  let run: Node[] = [];
  const flush = function* () {
    const nodes = run;
    run = [];
    const paragraph = makeParagraph(parent, root, nodes);
    if (paragraph) yield paragraph;
  };
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 3) run.push(child);
    else if (child.nodeType !== 1) continue;
    else if (isOwn(child)) yield* flush();
    else {
      const element = child as Element;
      if (!options.translateMenus && isChrome(element)) yield* flush();
      else if (splitsLines(parent, element)) yield* flush();
      else if (isSkipped(element)) {
        // Inline code and images stay part of the sentence around them.
        if (isInline(element)) run.push(element);
        else yield* flush();
      } else if (isInline(element) && !element.shadowRoot) run.push(element);
      else {
        yield* flush();
        yield* walk(element, options);
      }
    }
  }
  yield* flush();
  if (root.nodeType === 1 && (root as Element).shadowRoot)
    yield* walk((root as Element).shadowRoot!, options);
  yield undefined;
}

function makeParagraph(
  parent: Element,
  root: Element | ShadowRoot,
  nodes: Node[],
  wrapper?: Element,
): Paragraph | undefined {
  if (!nodes.length) return undefined;
  // Inside a shadow root the translation goes after the nodes, in the root.
  const whole =
    root === parent &&
    Array.from(parent.childNodes).every(
      (node) =>
        nodes.includes(node) ||
        isOwn(node) ||
        (node.nodeType === 3 && !originalText(node as Text).trim()) ||
        node.nodeName === "BR" ||
        node.nodeType === 8,
    );
  const trimmed = trimRun(nodes);
  // One element holding all of the text (a headline link, a link alone in
  // a list item or between blocks): the paragraph is its content, and the
  // outermost such element is the paragraph's wrapper.
  const [lone] = trimmed;
  if (
    trimmed.length === 1 &&
    lone.nodeType === 1 &&
    !isSkipped(lone as Element) &&
    !(lone as Element).shadowRoot
  )
    return makeParagraph(
      lone as Element,
      lone as Element,
      Array.from(lone.childNodes),
      wrapper ?? (lone as Element),
    );
  const source = serializeNodes(trimmed);
  if (!isTranslatableText(source.plain)) return undefined;
  // Code views drawn without code elements.
  if (isCodeView(parent)) return undefined;
  // The element the translation goes into.
  const host = wrapper?.parentElement ?? parent;
  if (!isHeading(parent) && !isHeading(host)) {
    const labels = labelsOf(parent, trimmed, source.plain, wrapper);
    // Dates, numbers, names and bylines stay; so do labels of menus and
    // buttons, unless those are translated: "Home" there is a word, not a
    // name. Headings are always text.
    if (labels && (labels !== "name" || !isInsideChrome(parent)))
      return undefined;
  }
  return {
    parent,
    nodes: trimmed,
    whole,
    inline:
      whole && !isTextBlock(host) && source.plain.length <= INLINE_MAX_CHARS,
    source,
    wrapper,
  };
}

// Lines set apart by line breaks outside running text (table cells, boxes
// of values) are paragraphs of their own: each line's translation follows
// it. In paragraphs, headings and list items a break is part of the text
// (verse, an address) and the text is translated whole.
function splitsLines(parent: Element, element: Element) {
  return element.localName === "br" && !isTextBlock(parent);
}

// Leading and trailing blank text, line breaks, elements that don't show
// (page metadata) and decorative content (icons, a hidden tooltip after a
// button) aren't part of the paragraph.

function trimRun(nodes: Node[]) {
  const blank = (node: Node) =>
    node.nodeType === 3
      ? !originalText(node as Text).trim()
      : node.nodeType !== 1 ||
        (node as Element).localName === "br" ||
        isDecorative(node as Element);
  let start = 0;
  let end = nodes.length;
  while (start < end && blank(nodes[start])) start++;
  while (end > start && blank(nodes[end - 1])) end--;
  return nodes.slice(start, end);
}

// At least two letters, and more than an address or a number.
export function isTranslatableText(text: string) {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 2) return false;
  if (/^\S+@\S+\.\S+$/.test(text)) return false;
  if (/^(https?:\/\/|www\.)\S+$/i.test(text)) return false;
  return true;
}

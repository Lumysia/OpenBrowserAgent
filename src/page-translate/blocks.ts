// Finds the page's paragraphs: the deepest elements whose content is only
// text and inline elements, and runs of text and inline elements next to
// blocks in mixed content. The DOM is not changed.
import {
  isChrome,
  isHeading,
  isInline,
  isInsideChrome,
  isOwn,
  isSkipped,
  isTextBlock,
} from "./dom-rules";
import { metadataOf } from "./metadata";
import { originalText } from "./originals";
import { serializeNodes, type Serialized } from "./serialize";

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
        node.nodeType === 8,
    );
  const trimmed = trimRun(nodes);
  // A lone inline element between blocks (a headline link in a card) is
  // laid out as a box of its own: its translation goes inside it, after its
  // text, and stays part of it.
  const [lone] = trimmed;
  if (
    !whole &&
    trimmed.length === 1 &&
    lone.nodeType === 1 &&
    !isSkipped(lone as Element) &&
    !(lone as Element).shadowRoot
  )
    return makeParagraph(
      lone as Element,
      lone as Element,
      Array.from(lone.childNodes),
    );
  const source = serializeNodes(trimmed);
  if (!isTranslatableText(source.plain)) return undefined;
  // Dates, numbers, names and bylines stay; headings are always text, and
  // so are the labels of menus and buttons (when they are translated):
  // "Home" there is a word, not a name.
  const language = parent.closest("[lang]")?.getAttribute("lang");
  const metadata =
    !isHeading(parent) && metadataOf(source.plain, language || undefined);
  if (metadata && (metadata !== "name" || !isInsideChrome(parent)))
    return undefined;
  return {
    parent,
    nodes: trimmed,
    whole,
    inline:
      whole && !isTextBlock(parent) && source.plain.length <= INLINE_MAX_CHARS,
    source,
  };
}

// Leading and trailing blank text nodes aren't part of the paragraph.
function trimRun(nodes: Node[]) {
  const blank = (node: Node) =>
    node.nodeType === 3 && !originalText(node as Text).trim();
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

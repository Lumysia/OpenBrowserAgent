// Translations in the page: one element per paragraph, in the form the
// space allows (see layout.ts): inside the paragraph's block after its
// text, or right after the element that holds the source (a headline link,
// a clamped box); in the tightest spots the translation is the block's
// tooltip instead. The page's own nodes are left as they are (a tooltip's
// title and a row's wrap mark are put back as they were); removing ours
// restores the page.
import { plainText } from "../shared/page-translate/placeholders";
import type { Paragraph } from "./blocks";
import { CONTROL_SELECTOR } from "./chrome";
import { TRANSLATION_ATTRIBUTE, TRANSLATION_TAG } from "./dom-rules";
import { buildTranslation, originalOf } from "./serialize";

// The forms that add an element to the page.
export type ElementForm = "block" | "inline";

// How our element shows.
export type Look = {
  form: ElementForm;
  // The faint rule before a block's text, in the margin; left out where the
  // margin has no room for it (inside cards and cells) and for centred or
  // end-aligned text, where it would stand apart from the text.
  mark: boolean;
  // The element the translation goes right after, instead of into the
  // paragraph's block: the source's wrapper or its clamped box.
  anchor?: Element;
  // A flex row holding only the source: it wraps, and the translation
  // takes a line of its own.
  wrap?: Element;
  // The source's font and colour, for a translation outside the source's
  // element (it can't inherit them).
  css?: string;
  // The space around a block translation (see spacing.ts): the space kept
  // under the source moved under it, and the space setting the pair apart.
  spacing?: string;
  // The source's clamp: as many lines, or one line with an ellipsis. The
  // whole translation is then the element's tooltip.
  clamp?: number | "ellipsis";
  // The link the source is: clicking the translation follows it.
  link?: Element;
  // The element the translation goes into lays its children out as flex or
  // grid items: an inline translation there is an item of its own, and its
  // leading space doesn't show, so it keeps a gap instead.
  item?: boolean;
};

// The space between the source and a translation under it.
export const TRANSLATION_GAP = "0.3em";
// The least space after a block translation, setting the pair apart from
// what comes next (see spacing.ts).
export const TRANSLATION_SPACE_AFTER = "0.7em";
// The rule before a block translation: its width, and its distance from the
// text; it sits in the margin, this far before the text.
const MARK_WIDTH_PX = 2;
const MARK_GAP_PX = 8;
export const MARK_OFFSET_PX = MARK_WIDTH_PX + MARK_GAP_PX;

const PENDING = "data-oba-pending";
const INLINE = "data-oba-inline";
const MARK = "data-oba-mark";
const CLAMP = "data-oba-clamp";
const LINK = "data-oba-link";
const ITEM = "data-oba-item";
// On a page's flex row while our translation in it takes a line of its own.
const WRAP = "data-oba-wrap";

// The translation inherits the page's font, size, colour and alignment and
// starts at the same edge as the source text. A faint rule in the text
// colour sets it apart in light and dark pages alike; it sits in the margin
// before the text (as far from it everywhere) and takes no room.
const CSS = `
${TRANSLATION_TAG}[${TRANSLATION_ATTRIBUTE}] {
  display: block;
  margin: ${TRANSLATION_GAP} 0 0;
  padding: 0;
  border: 0;
  font: inherit;
  color: inherit;
  text-align: inherit;
  text-indent: 0;
  white-space: normal;
  overflow-wrap: break-word;
  user-select: text;
}
${TRANSLATION_TAG}[${MARK}]:not([${INLINE}]) {
  margin-inline-start: -${MARK_OFFSET_PX}px;
  padding-inline-start: ${MARK_GAP_PX}px;
  border-inline-start: ${MARK_WIDTH_PX}px solid color-mix(in srgb, currentColor 24%, transparent);
}
${TRANSLATION_TAG}[${CLAMP}]:not([${INLINE}]) {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
${TRANSLATION_TAG}[${CLAMP}="ellipsis"]:not([${INLINE}]) {
  display: block;
  white-space: nowrap;
  text-overflow: ellipsis;
}
${TRANSLATION_TAG}[${LINK}] { cursor: pointer; }
[${WRAP}] { flex-wrap: wrap !important; }
[${WRAP}] > ${TRANSLATION_TAG}[${TRANSLATION_ATTRIBUTE}]:not([${INLINE}]) {
  flex: 0 0 100%;
}
${TRANSLATION_TAG}[${INLINE}] {
  display: inline;
  margin: 0;
  padding: 0;
  border: 0;
  white-space: inherit;
}
/* A space before it: the line may break there, so a table column or a row
   gets no wider than its longest word. */
${TRANSLATION_TAG}[${INLINE}]::before { content: " "; }
${TRANSLATION_TAG}[${INLINE}][${ITEM}] { margin-inline-start: 0.4em; }
${TRANSLATION_TAG}[${PENDING}] { opacity: 0.6; }
${TRANSLATION_TAG}[${PENDING}]:empty::after {
  content: "";
  display: inline-block;
  width: 0.7em;
  height: 0.7em;
  border: 0.12em solid currentColor;
  border-inline-end-color: transparent;
  border-radius: 50%;
  vertical-align: -0.05em;
  animation: oba-translation-spin 0.8s linear infinite;
}
@keyframes oba-translation-spin { to { transform: rotate(1turn); } }
@media (prefers-reduced-motion: reduce) {
  ${TRANSLATION_TAG}[${PENDING}]:empty::after { animation: none; opacity: 0.5; }
}
`;

// Our style sheet, in the document and in each shadow root with
// translations.
const styled = new Set<Element>();

function ensureStyle(node: Node) {
  const root = node.getRootNode() as Document | ShadowRoot;
  const owner =
    root.nodeType === 9
      ? (root as Document).head || (root as Document).documentElement
      : (root as ShadowRoot);
  if (!owner) return;
  for (const existing of styled) if (existing.parentNode === owner) return;
  const style = (node.ownerDocument || document).createElement("style");
  style.setAttribute(TRANSLATION_ATTRIBUTE, "");
  style.textContent = CSS;
  owner.appendChild(style);
  styled.add(style);
}

function createElement(paragraph: Paragraph, language: string) {
  const document = paragraph.parent.ownerDocument;
  const element = document.createElement(TRANSLATION_TAG);
  element.setAttribute(TRANSLATION_ATTRIBUTE, "");
  element.setAttribute("translate", "no");
  element.className = "notranslate";
  element.lang = language;
  element.addEventListener("click", followCopy);
  return element;
}

function prepare(
  paragraph: Paragraph,
  language: string,
  look: Look,
  current?: HTMLElement,
) {
  const element = current ?? createElement(paragraph, language);
  const block = look.form === "block";
  element.toggleAttribute(INLINE, !block);
  element.toggleAttribute(MARK, block && look.mark);
  element.toggleAttribute(ITEM, !block && !!look.item);
  element.style.cssText = [look.css, block && look.spacing]
    .filter(Boolean)
    .join("; ");
  if (block && look.clamp !== undefined) {
    element.setAttribute(CLAMP, look.clamp === "ellipsis" ? "ellipsis" : "");
    if (look.clamp !== "ellipsis")
      element.style.setProperty("-webkit-line-clamp", String(look.clamp));
  } else element.removeAttribute(CLAMP);
  if (look.link) links.set(element, look.link);
  else links.delete(element);
  element.toggleAttribute(LINK, !!look.link);
  if (
    !element.isConnected ||
    (look.anchor && element.previousSibling !== look.anchor)
  )
    place(paragraph, element, look);
  setWrap(element, block ? look.wrap : undefined);
  return element;
}

// Where the element goes: after the source's anchor, at the end of the
// paragraph's block, or right after the paragraph's nodes.
function place(paragraph: Paragraph, element: HTMLElement, look: Look) {
  ensureStyle(paragraph.parent);
  if (look.anchor) look.anchor.after(element);
  else if (paragraph.whole) paragraph.parent.appendChild(element);
  else {
    const last = paragraph.nodes[paragraph.nodes.length - 1];
    const end = look.form === "block" ? lineBreakAfter(last) : undefined;
    const before = end ?? last;
    before.parentNode?.insertBefore(element, before.nextSibling);
  }
}

// The line break that ends the line the node is on, if only blank text and
// elements that don't show are between them: a line of its own goes after
// it (before it, the break would add an empty line under the translation).
const UNSHOWN_TAGS = new Set(["LINK", "META", "STYLE", "SCRIPT", "TEMPLATE"]);

function lineBreakAfter(node: Node) {
  let next = node.nextSibling;
  while (
    next &&
    (next.nodeType === 3
      ? !next.textContent?.trim()
      : next.nodeType !== 1 || UNSHOWN_TAGS.has(next.nodeName))
  )
    next = next.nextSibling;
  return next?.nodeName === "BR" ? next : undefined;
}

// The rows wrapped for our elements.
const wrapped = new WeakMap<Element, Element>();

function setWrap(element: Element, row?: Element) {
  const current = wrapped.get(element);
  if (current === row) return;
  current?.removeAttribute(WRAP);
  wrapped.delete(element);
  if (!row) return;
  row.setAttribute(WRAP, "");
  wrapped.set(element, row);
}

// The source links of translations outside them.
const links = new WeakMap<Element, Element>();

// A spinner where the translation will be.
export function showPending(
  paragraph: Paragraph,
  language: string,
  look: Look,
  current?: HTMLElement,
) {
  const element = prepare(paragraph, language, look, current);
  element.setAttribute(PENDING, "");
  return element;
}

// The translation so far, as plain text.
export function showPartial(
  paragraph: Paragraph,
  language: string,
  look: Look,
  text: string,
  current?: HTMLElement,
) {
  const element = showPending(paragraph, language, look, current);
  element.textContent = text;
  element.removeAttribute("title");
  return element;
}

export function showTranslation(
  paragraph: Paragraph,
  language: string,
  look: Look,
  translation: string,
  current?: HTMLElement,
) {
  const element = prepare(paragraph, language, look, current);
  element.removeAttribute(PENDING);
  element.replaceChildren(
    buildTranslation(
      paragraph.parent.ownerDocument,
      paragraph.source,
      translation,
    ),
  );
  // A clamped translation can be read whole on hover.
  if (element.hasAttribute(CLAMP)) element.title = plainText(translation);
  else element.removeAttribute("title");
  return element;
}

export function removeTranslation(element?: HTMLElement) {
  if (!element) return;
  setWrap(element);
  element.remove();
}

// The translations shown as an element's tooltip: one per paragraph in it,
// before the title the page gave it.
type Titled = {
  previous: string | null;
  texts: Map<Tooltip, string>;
  title: string;
};
const titled = new WeakMap<Element, Titled>();

export type Tooltip = { element: Element };

function writeTitle(element: Element, entry: Titled) {
  const title = [...entry.texts.values(), entry.previous]
    .filter((text) => text)
    .join("\n");
  entry.title = title;
  element.setAttribute("title", title);
}

// The translation as the block's tooltip.
export function showTooltip(
  paragraph: Paragraph,
  translation: string,
  current?: Tooltip,
): Tooltip {
  const element = paragraph.parent;
  const text = plainText(translation);
  let entry = titled.get(element);
  // The page changed the title since: it is the page's own again.
  if (entry && element.getAttribute("title") !== entry.title) entry = undefined;
  if (!entry) {
    entry = {
      previous: element.getAttribute("title"),
      texts: new Map(),
      title: "",
    };
    titled.set(element, entry);
  }
  const tooltip = current?.element === element ? current : { element };
  entry.texts.set(tooltip, text);
  writeTitle(element, entry);
  return tooltip;
}

// The block's own title again once none of its paragraphs shows a tooltip,
// unless the page has changed it since.
export function removeTooltip(tooltip?: Tooltip) {
  if (!tooltip) return;
  const { element } = tooltip;
  const entry = titled.get(element);
  if (!entry?.texts.delete(tooltip)) return;
  if (element.getAttribute("title") !== entry.title) {
    titled.delete(element);
    return;
  }
  if (entry.texts.size) return writeTitle(element, entry);
  titled.delete(element);
  if (entry.previous === null) element.removeAttribute("title");
  else element.setAttribute("title", entry.previous);
}

// Removes everything this script added to the page.
export function removeAll(document: Document) {
  for (const style of styled) style.remove();
  styled.clear();
  document
    .querySelectorAll(`[${WRAP}]`)
    .forEach((row) => row.removeAttribute(WRAP));
  document
    .querySelectorAll(`[${TRANSLATION_ATTRIBUTE}]`)
    .forEach((element) => element.remove());
}

// A copied link has the original's address but not the page's click
// handlers (single-page apps route through them): a plain click goes to the
// original instead. Clicks with modifier keys open the address as usual.
// A copied control (a button kept in its sentence) has no handlers at all:
// a click on it is a click on the original. A translation outside its
// source link has no link of its own: a plain click on it goes to the
// source link.
function followCopy(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return;
  const target = event.target as Element | null;
  const copy = target?.closest?.(`a, ${CONTROL_SELECTOR}`);
  const modified =
    event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
  if (modified && (!copy || copy.localName === "a")) return;
  const original =
    (copy && originalOf(copy)) || links.get(event.currentTarget as Element);
  if (!original?.isConnected) return;
  event.preventDefault();
  (original as HTMLElement).click();
}

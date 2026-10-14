// Translations in the page: one element per paragraph, inside the
// paragraph's block (after its text), in the form the space allows (see
// layout.ts); in the tightest spots the translation is the block's tooltip
// instead. The page's own nodes are left as they are (a tooltip's title is
// put back as it was); removing ours restores the page.
import { stripPlaceholders } from "../shared/page-translate/placeholders";
import type { Paragraph } from "./blocks";
import { TRANSLATION_ATTRIBUTE, TRANSLATION_TAG } from "./dom-rules";
import { buildTranslation, originalOf } from "./serialize";

// The forms that add an element to the page.
export type ElementForm = "block" | "inline";

// How our element shows: its form, and whether a block has the rule that
// sets it apart (not for centred or end-aligned text, where a rule at the
// start edge would stand apart from the text).
export type Look = { form: ElementForm; rule: boolean };

const PENDING = "data-oba-pending";
const INLINE = "data-oba-inline";
const PLAIN = "data-oba-plain";

// The translation inherits the page's font, size, colour and alignment and
// starts at the same edge as the source text. A faint rule in the text
// colour sets it apart in light and dark pages alike; it sits in the margin
// before the text and takes no room.
const CSS = `
${TRANSLATION_TAG}[${TRANSLATION_ATTRIBUTE}] {
  display: block;
  position: relative;
  margin: 0.3em 0 0;
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
${TRANSLATION_TAG}[${TRANSLATION_ATTRIBUTE}]:not([${INLINE}], [${PLAIN}])::before {
  content: "";
  position: absolute;
  inset-block: 0.2em;
  inset-inline-start: -0.5em;
  width: 2px;
  background: color-mix(in srgb, currentColor 24%, transparent);
  pointer-events: none;
}
${TRANSLATION_TAG}[${INLINE}] {
  display: inline;
  position: static;
  margin: 0;
  padding: 0;
  border: 0;
  white-space: inherit;
}
/* A space before it: the line may break there, so a table column or a row
   gets no wider than its longest word. */
${TRANSLATION_TAG}[${INLINE}]::before { content: " "; }
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
  element.addEventListener("click", followCopiedLink);
  return element;
}

function prepare(
  paragraph: Paragraph,
  language: string,
  look: Look,
  current?: HTMLElement,
) {
  const element = current ?? createElement(paragraph, language);
  element.toggleAttribute(INLINE, look.form === "inline");
  element.toggleAttribute(PLAIN, !look.rule);
  return element;
}

// Where the element goes: at the end of the paragraph's block, or right
// after the paragraph's nodes.
function place(paragraph: Paragraph, element: HTMLElement) {
  ensureStyle(paragraph.parent);
  if (paragraph.whole) paragraph.parent.appendChild(element);
  else {
    const last = paragraph.nodes[paragraph.nodes.length - 1];
    last.parentNode?.insertBefore(element, last.nextSibling);
  }
}

// A spinner where the translation will be.
export function showPending(
  paragraph: Paragraph,
  language: string,
  look: Look,
  current?: HTMLElement,
) {
  const element = prepare(paragraph, language, look, current);
  element.setAttribute(PENDING, "");
  if (!element.isConnected) place(paragraph, element);
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
  if (!element.isConnected) place(paragraph, element);
  return element;
}

export function removeTranslation(element?: HTMLElement) {
  element?.remove();
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
  const text = stripPlaceholders(translation).replace(/\s+/g, " ").trim();
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
    .querySelectorAll(`[${TRANSLATION_ATTRIBUTE}]`)
    .forEach((element) => element.remove());
}

// A copied link has the original's address but not the page's click
// handlers (single-page apps route through them): a plain click goes to the
// original instead. Clicks with modifier keys open the address as usual.
function followCopiedLink(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const target = event.target as Element | null;
  const link = target?.closest?.("a");
  const original = link && originalOf(link);
  if (!original?.isConnected) return;
  event.preventDefault();
  (original as HTMLElement).click();
}

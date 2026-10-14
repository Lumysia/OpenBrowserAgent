// Translations in the page: one element per paragraph, inside the
// paragraph's block (after its text), so flex and grid layouts get no new
// items and frameworks that own the block's siblings aren't disturbed. The
// page's own nodes are never changed; removing ours restores the page.
import type { Paragraph } from "./blocks";
import {
  SOURCE_ATTRIBUTE,
  TRANSLATION_ATTRIBUTE,
  TRANSLATION_ONLY_ATTRIBUTE,
  TRANSLATION_TAG,
} from "./dom-rules";
import { buildTranslation, originalOf } from "./serialize";

const PENDING = "data-oba-pending";
const INLINE = "data-oba-inline";

// The translation inherits the page's font, size and colour; a faint rule
// in the text colour sets it apart in light and dark pages alike.
const CSS = `
${TRANSLATION_TAG}[${TRANSLATION_ATTRIBUTE}] {
  display: block;
  margin: 0.3em 0 0;
  padding: 0 0 0 0.6em;
  border: 0;
  border-inline-start: 2px solid color-mix(in srgb, currentColor 24%, transparent);
  font: inherit;
  color: inherit;
  text-align: start;
  text-indent: 0;
  white-space: normal;
  overflow-wrap: break-word;
  user-select: text;
}
${TRANSLATION_TAG}[${INLINE}] {
  display: inline;
  margin: 0 0 0 0.4em;
  padding: 0;
  border: 0;
}
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
:root[${TRANSLATION_ONLY_ATTRIBUTE}] [${SOURCE_ATTRIBUTE}] {
  font-size: 0 !important;
}
:root[${TRANSLATION_ONLY_ATTRIBUTE}] [${SOURCE_ATTRIBUTE}] > :not(${TRANSLATION_TAG}) {
  display: none !important;
}
:root[${TRANSLATION_ONLY_ATTRIBUTE}] [${SOURCE_ATTRIBUTE}] > ${TRANSLATION_TAG} {
  font-size: var(--oba-font-size) !important;
  margin: 0;
  padding: 0;
  border: 0;
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

export type Rendered = { element: HTMLElement };

function createElement(paragraph: Paragraph, language: string) {
  const document = paragraph.parent.ownerDocument;
  const element = document.createElement(TRANSLATION_TAG);
  element.setAttribute(TRANSLATION_ATTRIBUTE, "");
  element.setAttribute("translate", "no");
  element.className = "notranslate";
  element.lang = language;
  if (paragraph.inline) element.setAttribute(INLINE, "");
  element.addEventListener("click", followCopiedLink);
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
  current?: HTMLElement,
) {
  const element = current ?? createElement(paragraph, language);
  element.setAttribute(PENDING, "");
  if (!element.isConnected) place(paragraph, element);
  return element;
}

// The translation so far, as plain text.
export function showPartial(
  paragraph: Paragraph,
  language: string,
  text: string,
  current?: HTMLElement,
) {
  const element = showPending(paragraph, language, current);
  element.textContent = text;
  return element;
}

export function showTranslation(
  paragraph: Paragraph,
  language: string,
  translation: string,
  current?: HTMLElement,
) {
  const element = current ?? createElement(paragraph, language);
  element.removeAttribute(PENDING);
  element.replaceChildren(
    buildTranslation(
      paragraph.parent.ownerDocument,
      paragraph.source,
      translation,
    ),
  );
  if (!element.isConnected) place(paragraph, element);
  // Translation-only display hides the rest of a block whose content is
  // this one paragraph.
  if (paragraph.whole && !paragraph.inline) {
    if (
      paragraph.parent.ownerDocument.documentElement.hasAttribute(
        TRANSLATION_ONLY_ATTRIBUTE,
      )
    )
      keepFontSize(paragraph, element);
    paragraph.parent.setAttribute(SOURCE_ATTRIBUTE, "");
  }
  return element;
}

// Translation-only display sets the block's own text to size 0; its
// translation keeps the block's size. Read before that applies.
function keepFontSize(paragraph: Paragraph, element: HTMLElement) {
  if (element.style.getPropertyValue("--oba-font-size")) return;
  const view = paragraph.parent.ownerDocument.defaultView;
  const size = view?.getComputedStyle(paragraph.parent).fontSize;
  if (size) element.style.setProperty("--oba-font-size", size);
}

export function removeTranslation(paragraph: Paragraph, element?: HTMLElement) {
  element?.remove();
  if (paragraph.whole) paragraph.parent.removeAttribute(SOURCE_ATTRIBUTE);
}

// `rendered`: the translations shown now.
export function setTranslationOnly(
  document: Document,
  on: boolean,
  rendered: Array<[Paragraph, HTMLElement]> = [],
) {
  if (on && !document.documentElement.hasAttribute(TRANSLATION_ONLY_ATTRIBUTE))
    for (const [paragraph, element] of rendered)
      if (paragraph.whole && !paragraph.inline)
        keepFontSize(paragraph, element);
  document.documentElement.toggleAttribute(TRANSLATION_ONLY_ATTRIBUTE, on);
}

// Removes everything this script added to the page.
export function removeAll(document: Document) {
  setTranslationOnly(document, false);
  for (const style of styled) style.remove();
  styled.clear();
  document
    .querySelectorAll(`${TRANSLATION_TAG}[${TRANSLATION_ATTRIBUTE}]`)
    .forEach((element) => element.remove());
  document
    .querySelectorAll(`[${SOURCE_ATTRIBUTE}]`)
    .forEach((element) => element.removeAttribute(SOURCE_ATTRIBUTE));
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

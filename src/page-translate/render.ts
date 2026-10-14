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
  form: ElementForm,
  current?: HTMLElement,
) {
  const element = current ?? createElement(paragraph, language);
  element.toggleAttribute(INLINE, form === "inline");
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
  form: ElementForm,
  current?: HTMLElement,
) {
  const element = prepare(paragraph, language, form, current);
  element.setAttribute(PENDING, "");
  if (!element.isConnected) place(paragraph, element);
  return element;
}

// The translation so far, as plain text.
export function showPartial(
  paragraph: Paragraph,
  language: string,
  form: ElementForm,
  text: string,
  current?: HTMLElement,
) {
  const element = showPending(paragraph, language, form, current);
  element.textContent = text;
  return element;
}

export function showTranslation(
  paragraph: Paragraph,
  language: string,
  form: ElementForm,
  translation: string,
  current?: HTMLElement,
) {
  const element = prepare(paragraph, language, form, current);
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

export type Tooltip = {
  element: Element;
  text: string;
  previous: string | null;
};

// The translation as the block's tooltip, before a title it has.
export function showTooltip(
  paragraph: Paragraph,
  translation: string,
  current?: Tooltip,
): Tooltip {
  const element = paragraph.parent;
  const text = stripPlaceholders(translation).replace(/\s+/g, " ").trim();
  const previous = current ? current.previous : element.getAttribute("title");
  const title = previous ? `${text}\n${previous}` : text;
  element.setAttribute("title", title);
  return { element, text: title, previous };
}

// The block's own title again, unless the page has changed it since.
export function removeTooltip(tooltip?: Tooltip) {
  if (!tooltip || tooltip.element.getAttribute("title") !== tooltip.text)
    return;
  if (tooltip.previous === null) tooltip.element.removeAttribute("title");
  else tooltip.element.setAttribute("title", tooltip.previous);
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

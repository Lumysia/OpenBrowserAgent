// How a translation in the page looks next to its source: the source's
// font and colour when it can't inherit them, the source's line clamp,
// and whether the rule that sets it apart has room in the margin. Only
// reads styles and boxes (see layout.ts).
import { HEADING_SELECTOR } from "../shared/dom-vocabulary";
import { wordCount } from "../shared/text";
import { MARK_OFFSET_PX, type Look } from "./render";
import { clipsOverflow, hasBackground } from "./styles";

// What layout.ts decides about the look; the form is decided separately.
export type LookDetails = Omit<Look, "form">;

// The text properties a translation outside the source's element copies,
// when they differ from those of the element it goes into.
const TEXT_PROPERTIES = [
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-transform",
] as const;

// The source's text style where it differs from the host's (the element the
// translation goes into): the translation reads as the same text.
export function copiedText(
  source: CSSStyleDeclaration,
  host: CSSStyleDeclaration,
) {
  return TEXT_PROPERTIES.flatMap((name) => {
    const value = source.getPropertyValue(name);
    return value && value !== host.getPropertyValue(name)
      ? [`${name}: ${value}`]
      : [];
  }).join("; ");
}

// How a box cuts its text: a number of lines, one line with an ellipsis,
// or not at all.
export function clampOf(style: CSSStyleDeclaration): Look["clamp"] {
  const lines = parseInt(style.getPropertyValue("-webkit-line-clamp"), 10);
  if (lines > 0) return lines;
  if (style.textOverflow === "ellipsis") return "ellipsis";
  return undefined;
}

// A text cut to one line with an ellipsis is shown again only when it is
// content (a heading, a headline), not a short label.
const CONTENT_MIN_WORDS = 4;

export function isContent(text: string, clamp: Look["clamp"], block: Element) {
  if (clamp !== "ellipsis") return true;
  if (block.closest(HEADING_SELECTOR)) return true;
  return wordCount(text) >= CONTENT_MIN_WORDS;
}

// The rule goes in open margins only: not inside a box drawn on the page
// (a card, a table cell, a coloured panel), where it would read as part of
// the box, and only with room for it and as much again before the text.
const MARK_ROOM_PX = 2 * MARK_OFFSET_PX;
// A drawn box at least this share of the window's width is the page's own
// background, not a box on the page.
const PAGE_WIDTH_SHARE = 0.9;

export function hasMarkRoom(
  host: Element,
  textStart: number,
  style: CSSStyleDeclaration,
  view: Window,
) {
  const rtl = style.direction === "rtl";
  const body = host.ownerDocument.body;
  // Whatever comes first: a drawn box's edge, or something beside the text
  // (an icon, a picture, a column in a row).
  let edge = rtl ? view.innerWidth : 0;
  const nearer = (x: number) =>
    (edge = rtl ? Math.min(edge, x) : Math.max(edge, x));
  for (
    let element: Element | null = host;
    element && element !== body.parentElement;
    element = element.parentElement
  ) {
    const current = element === host ? style : view.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const beside = besideStart(element, box, rtl);
    if (beside !== undefined) nearer(beside);
    if (!isDrawnBox(current, rtl)) continue;
    if (box.width < view.innerWidth * PAGE_WIDTH_SHARE) return false;
    nearer(
      rtl
        ? box.right - parseFloat(current.borderRightWidth)
        : box.left + parseFloat(current.borderLeftWidth),
    );
    break;
  }
  const room = rtl ? edge - textStart : textStart - edge;
  return room >= MARK_ROOM_PX;
}

// The end edge of the element's previous sibling when it sits beside the
// element, before its start edge.
function besideStart(element: Element, box: DOMRect, rtl: boolean) {
  for (
    let sibling = element.previousElementSibling;
    sibling;
    sibling = sibling.previousElementSibling
  ) {
    const other = sibling.getBoundingClientRect();
    if (!other.width || !other.height) continue;
    if (other.bottom <= box.top || other.top >= box.bottom) return undefined;
    if (rtl ? other.left >= box.right - 1 : other.right <= box.left + 1)
      return rtl ? other.left : other.right;
    return undefined;
  }
  return undefined;
}

// A box whose edge shows: a background, a border on the start side, a
// shadow, or one that cuts off what overflows.
function isDrawnBox(style: CSSStyleDeclaration, rtl: boolean) {
  const start = rtl ? style.borderRightWidth : style.borderLeftWidth;
  return (
    hasBackground(style) ||
    parseFloat(start) > 0 ||
    style.boxShadow !== "none" ||
    clipsOverflow(style)
  );
}

export function startAligned(style: CSSStyleDeclaration) {
  const align = style.textAlign;
  return (
    /^(start|justify)$/.test(align) ||
    align === (style.direction === "rtl" ? "right" : "left")
  );
}

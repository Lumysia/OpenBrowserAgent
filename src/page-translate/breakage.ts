// Whether a translation broke the page: the boxes it is checked against,
// measured before it went in and again after (see layout.ts for where it
// goes). Only reads styles and boxes.
import { isOwn } from "./dom-rules";
import type { Placement } from "./layout";
import { SUBPIXEL_PX } from "./styles";

export type AreaBox = {
  width: number;
  height: number;
  container: number;
  overflow: number;
  // The widths of the box's children (rows with a few items only).
  items: number[];
};

// Growth that counts as pushing a box.
const TOLERANCE_PX = 4;
// Rows with more items than this aren't checked item by item.
const MAX_ITEMS = 24;

export function measureArea(area: Element): AreaBox {
  const box = area.getBoundingClientRect();
  // Our own elements aren't items of the page's row.
  const children = Array.from(area.children).filter((child) => !isOwn(child));
  return {
    width: box.width,
    height: box.height,
    container: area.parentElement?.clientWidth ?? Infinity,
    overflow: area.scrollWidth - area.clientWidth,
    items:
      children.length > MAX_ITEMS
        ? []
        : children.map((child) => child.getBoundingClientRect().width),
  };
}

// The boxes a placement is checked against.
export function boxesOf(placement: Placement) {
  return [placement.area, placement.row].filter(
    (element): element is Element => !!element,
  );
}

// How a translation broke the page: `self` (it sticks out of the element it
// is in or of a box that cuts it off, pushed the other items of its row, or
// scrolls the page sideways), `area` (its table or row got wider than the
// room it has) or `line` (an inline translation in a row item wrapped onto
// more lines: it reads better on a line of its own). Growing taller isn't
// breaking.
export type Breakage = "self" | "area" | "line" | undefined;

export function breaksLayout(
  element: Element,
  placement: Placement,
  before: Map<Element, AreaBox>,
  pageGrew: boolean,
): Breakage {
  const box = element.getBoundingClientRect();
  if (!box.width && !box.height) return undefined;
  // The rule sits in the margin, outside the text's edge.
  const view = element.ownerDocument.defaultView!;
  const style = view.getComputedStyle(element);
  const start = -Math.min(0, parseFloat(style.marginInlineStart) || 0);
  const rtl = style.direction === "rtl";
  const outside = (limit: DOMRect, below = 0) =>
    box.bottom > limit.bottom + below + SUBPIXEL_PX ||
    box.right > limit.right + SUBPIXEL_PX + (rtl ? start : 0) ||
    box.left < limit.left - SUBPIXEL_PX - (rtl ? 0 : start);
  // The page's own text may already reach below its box (see overhang).
  if (
    placement.host &&
    outside(placement.host.getBoundingClientRect(), placement.overhang)
  )
    return "self";
  if (placement.clip && outside(placement.clip.getBoundingClientRect()))
    return "self";
  const row = placement.row && before.get(placement.row);
  if (row) {
    if (
      placement.form === "inline" &&
      placement.host &&
      placement.host.getBoundingClientRect().height >
        (placement.height ?? Infinity) + TOLERANCE_PX
    )
      return "line";
    const now = measureArea(placement.row!);
    const own = Array.from(placement.row!.children)
      .filter((child) => !isOwn(child))
      .findIndex((child) => child.contains(element));
    if (
      row.items.some(
        (width, index) =>
          index !== own &&
          Math.abs((now.items[index] ?? width) - width) > TOLERANCE_PX,
      )
    )
      return "self";
  }
  const area = placement.area && before.get(placement.area);
  if (area) {
    // Wider than the room it has now: a box that grows with its content
    // (a shrink-to-fit heading row) isn't overflowing.
    const now = measureArea(placement.area!);
    if (
      (now.width > area.width + TOLERANCE_PX &&
        now.width > now.container + SUBPIXEL_PX) ||
      now.overflow > area.overflow + TOLERANCE_PX
    )
      return "area";
  }
  const page = element.ownerDocument.documentElement;
  return pageGrew && box.right > page.clientWidth + SUBPIXEL_PX
    ? "self"
    : undefined;
}

// Where a translation fits without changing the page's layout. Before a
// translation goes in, the space around its paragraph decides its form;
// after, its box is checked, and an area it broke gets the compact form.
// Only read here (styles and boxes); the caller batches reads before writes.
import type { Paragraph } from "./blocks";
import { controlOf, isTextBlock } from "./dom-rules";
import { originalText } from "./originals";

// `block`: on its own line under the paragraph. `inline`: on the same line,
// after it. `tooltip`: shown on hover (the paragraph's title). `hidden`: the
// paragraph isn't visible (a skip link, text for screen readers only).
// `skip`: a control's label while menus and buttons aren't translated; it
// keeps its text in both displays.
export type Form = "block" | "inline" | "tooltip" | "hidden" | "skip";

export type Placement = {
  form: Form;
  // The table, flex or grid container the paragraph is laid out in: one
  // translation breaking it puts the whole area in the compact form.
  area?: Element;
  // The nearest box around it that cuts off what overflows.
  clip?: Element;
  // The horizontal row (flex or grid) the translation is laid out in: the
  // block itself (our element is a new item) or the row the block is an
  // item of. The row keeps its height and its items their widths.
  row?: Element;
  // The kind of unit (see kindOf).
  kind?: string;
  // The text starts at the block's start edge (see render's Look).
  rule?: boolean;
};

export type AreaBox = {
  width: number;
  height: number;
  container: number;
  overflow: number;
  // The widths of the box's children (rows with a few items only).
  items: number[];
};

// Ancestors whose box is about the paragraph's own: their limits are the
// paragraph's limits.
const CLOSE_DEPTH = 3;
const CLOSE_SLACK_PX = 8;
// How far up the area and the clipping box are looked for.
const AREA_DEPTH = 6;
// Growth that counts as breaking a box.
const TOLERANCE_PX = 4;

const rank: Record<Form, number> = {
  block: 0,
  inline: 1,
  tooltip: 2,
  hidden: 3,
  skip: 4,
};
export const tighter = (a: Form, b: Form) => (rank[b] > rank[a] ? b : a);

// The form for a paragraph, or undefined when it isn't rendered now (in a
// collapsed section): it is placed when it shows.
export function choosePlacement(
  paragraph: Paragraph,
  compact: WeakSet<Element>,
  translateMenus: boolean,
): Placement | undefined {
  const block = paragraph.parent;
  if (!block.getClientRects().length) return undefined;
  const view = block.ownerDocument.defaultView!;
  const style = view.getComputedStyle(block);
  // A control's size and look are designed around its label: its
  // translation never goes into it (a tooltip when menus are translated).
  const label = soleElement(paragraph) ?? block;
  if (controlOf(label) || isDrawnControl(paragraph, view))
    return { form: translateMenus ? "tooltip" : "skip" };
  const box = nodesBox(paragraph);
  // Visually hidden text (1px clip, off-screen skip links) stays as it is.
  if (box.width < 2 || box.height < 2) return { form: "hidden" };
  let form: Form = paragraph.inline ? "inline" : "block";
  const blockBox = block.getBoundingClientRect();
  let nowrap = false;
  let clips = false;
  for (
    let element: Element | null = block, depth = 0;
    element && depth < CLOSE_DEPTH && element !== block.ownerDocument.body;
    element = element.parentElement, depth++
  ) {
    if (
      depth &&
      element.getBoundingClientRect().height > blockBox.height + CLOSE_SLACK_PX
    )
      break;
    const current = depth ? view.getComputedStyle(element) : style;
    // Text cut to one line or a few, or a box that can't grow: a new line
    // would be cut off, and text on the same line too.
    if (
      current.textOverflow === "ellipsis" ||
      (current.getPropertyValue("-webkit-line-clamp") || "none") !== "none" ||
      current.maxHeight !== "none" ||
      // Placed on top of the page (a map label, a badge on an image): it
      // keeps its size and covers what is around it if it grows.
      /absolute|fixed/.test(current.position)
    )
      form = tighter(form, "tooltip");
    if (/^(nowrap|pre)$/.test(current.whiteSpace)) nowrap = true;
    if (/hidden|clip/.test(current.overflowX + current.overflowY)) clips = true;
  }
  // A single line that hides what overflows has no room for more text; a
  // single line that doesn't can take the translation on the same line.
  if (nowrap) form = tighter(form, clips ? "tooltip" : "inline");
  else if (clips && !isTextBlock(block)) form = tighter(form, "inline");
  form = tighter(form, ownForm(block, style));
  const parent = block.parentElement;
  // An item in a horizontal row (tabs, a menu bar, cards side by side)
  // stays one line high, like its neighbours.
  const inRow =
    !!parent &&
    parent.childElementCount > 1 &&
    isRow(view.getComputedStyle(parent));
  if (inRow) form = tighter(form, "inline");
  // After a block-level element the same line doesn't continue: an inline
  // translation would start a line of its own (a label set as a block in
  // a radio control).
  const last = paragraph.nodes[paragraph.nodes.length - 1];
  if (
    form === "inline" &&
    last.nodeType === 1 &&
    !/^(inline|contents)/.test(view.getComputedStyle(last as Element).display)
  )
    form = "tooltip";
  const placement: Placement = {
    form,
    row: isRow(style) ? block : inRow ? parent! : undefined,
    kind: kindOf(paragraph),
    rule: startAligned(style),
    ...areaOf(block, view),
  };
  if (placement.area && compact.has(placement.area))
    placement.form = tighter(placement.form, "tooltip");
  if (compact.has(block)) placement.form = tighter(placement.form, "tooltip");
  return placement;
}

// What kind of unit a paragraph is: its block's tag, role and classes and
// those of the block's parent. Units of one kind (the headlines of a list of
// cards, the cells of a table column) show their translations one way.
function kindOf(paragraph: Paragraph) {
  const name = (element: Element | null) =>
    element
      ? `${element.tagName}[${element.getAttribute("role") || ""}].${[...element.classList].sort().join(".")}`
      : "";
  const block = paragraph.parent;
  return `${name(block.parentElement)}>${name(block)}${paragraph.whole ? "" : "~"}`;
}

function startAligned(style: CSSStyleDeclaration) {
  const align = style.textAlign;
  return (
    /^(start|justify)$/.test(align) ||
    align === (style.direction === "rtl" ? "right" : "left")
  );
}

// What the block itself allows.
function ownForm(block: Element, style: CSSStyleDeclaration): Form {
  // Our element would be a new cell of the grid.
  if (/grid/.test(style.display)) return "tooltip";
  // A table header: one line.
  if (block.tagName.toUpperCase() === "TH") return "inline";
  if (/^inline/.test(style.display) || style.display === "contents")
    return "inline";
  // Our element would be a new item next to the paragraph's text.
  if (/flex/.test(style.display) && !style.flexDirection.startsWith("column"))
    return "inline";
  return "block";
}

// Words at most in a control's label.
const LABEL_MAX_WORDS = 6;
// A control is at most this many lines high.
const CONTROL_MAX_LINES = 3;

// A link drawn as a button (a pill, a chip): a short label in a small box
// with its own background or border.
function isDrawnControl(paragraph: Paragraph, view: Window) {
  const link = (soleElement(paragraph) ?? paragraph.parent).closest("a[href]");
  if (!link) return false;
  const text = paragraph.source.plain;
  if (text.split(" ").length > LABEL_MAX_WORDS || /[.!?:]$/.test(text))
    return false;
  const style = view.getComputedStyle(link);
  const painted =
    !/^(transparent|rgba\(.*,\s*0\))$/.test(style.backgroundColor) ||
    style.backgroundImage !== "none" ||
    (parseFloat(style.borderTopWidth) > 0 &&
      style.borderTopStyle !== "none" &&
      parseFloat(style.borderBottomWidth) > 0);
  if (!painted) return false;
  const line =
    parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 20;
  return link.getBoundingClientRect().height <= line * CONTROL_MAX_LINES;
}

// The paragraph's only node when it is an element (a link in a list item).
function soleElement(paragraph: Paragraph) {
  const [node] = paragraph.nodes;
  return paragraph.nodes.length === 1 && node.nodeType === 1
    ? (node as Element)
    : undefined;
}

function isRow(style: CSSStyleDeclaration) {
  if (/flex/.test(style.display))
    return !style.flexDirection.startsWith("column");
  return (
    /grid/.test(style.display) &&
    style.gridTemplateColumns.trim().split(/\s+/).length > 1
  );
}

function areaOf(block: Element, view: Window) {
  let area: Element | undefined;
  let clip: Element | undefined;
  const body = block.ownerDocument.body;
  for (
    let element: Element | null = block, depth = 0;
    element && element !== body && depth < AREA_DEPTH && !(area && clip);
    element = element.parentElement, depth++
  ) {
    const style = view.getComputedStyle(element);
    if (
      !area &&
      /table|flex|grid/.test(style.display) &&
      !/table-/.test(style.display)
    )
      area = element;
    if (!clip && /hidden|clip/.test(style.overflowX + style.overflowY))
      clip = element;
  }
  return { area, clip };
}

// The box of the paragraph's text as the page shows it. Text inside a box
// of 1px or less (visually hidden labels, icon-only buttons) doesn't show,
// however wide the text itself is.
function nodesBox(paragraph: Paragraph) {
  let width = 0;
  let height = 0;
  const range = paragraph.parent.ownerDocument.createRange();
  for (const token of paragraph.source.tokens) {
    if (token.type !== "text" || !originalText(token.node).trim()) continue;
    if (insideTinyBox(token.node, paragraph.parent)) continue;
    range.selectNodeContents(token.node);
    const box = range.getBoundingClientRect();
    width = Math.max(width, box.width);
    height = Math.max(height, box.height);
  }
  return { width, height };
}

function insideTinyBox(node: Text, block: Element) {
  for (
    let element = node.parentElement;
    element && element !== block.parentElement;
    element = element.parentElement
  ) {
    // No boxes: `display: contents`, nothing to measure.
    if (!element.getClientRects().length) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return true;
  }
  return false;
}

// Rows with more items than this aren't checked item by item.
const MAX_ITEMS = 24;

export function measureArea(area: Element): AreaBox {
  const box = area.getBoundingClientRect();
  const children = area.children;
  return {
    width: box.width,
    height: box.height,
    container: area.parentElement?.clientWidth ?? Infinity,
    overflow: area.scrollWidth - area.clientWidth,
    items:
      children.length > MAX_ITEMS
        ? []
        : Array.from(children, (child) => child.getBoundingClientRect().width),
  };
}

// The boxes a placement is checked against.
export function boxesOf(placement: Placement) {
  return [placement.area, placement.row].filter(
    (element): element is Element => !!element,
  );
}

// Whether the translation shown in `element` broke the layout: it sticks
// out of its paragraph's box (a box of fixed size) or out of a box that
// cuts it off, made its row taller or pushed the row's other items, or made
// its table or row wider than the room it has.
export function breaksLayout(
  element: Element,
  paragraph: Paragraph,
  placement: Placement,
  before: Map<Element, AreaBox>,
  pageGrew: boolean,
) {
  const box = element.getBoundingClientRect();
  if (!box.width && !box.height) return false;
  const outside = (limit: DOMRect) =>
    box.bottom > limit.bottom + 1 ||
    box.right > limit.right + 1 ||
    box.left < limit.left - 1;
  if (outside(paragraph.parent.getBoundingClientRect())) return true;
  if (placement.clip && outside(placement.clip.getBoundingClientRect()))
    return true;
  const row = placement.row && before.get(placement.row);
  if (row) {
    // A taller row (the translation wrapped, or became an item on a line
    // of its own), or items pushed narrower or wider.
    const now = measureArea(placement.row!);
    if (now.height > row.height + TOLERANCE_PX) return true;
    const own = Array.prototype.indexOf.call(
      placement.row!.children,
      paragraph.parent,
    );
    if (
      row.items.some(
        (width, index) =>
          index !== own &&
          Math.abs((now.items[index] ?? width) - width) > TOLERANCE_PX,
      )
    )
      return true;
  }
  const area = placement.area && before.get(placement.area);
  if (area) {
    const now = measureArea(placement.area!);
    if (
      (now.width > area.width + TOLERANCE_PX &&
        now.width > area.container + 1) ||
      now.overflow > area.overflow + TOLERANCE_PX
    )
      return true;
  }
  const page = element.ownerDocument.documentElement;
  return pageGrew && box.right > page.clientWidth + 1;
}

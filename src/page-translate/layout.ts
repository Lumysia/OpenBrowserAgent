// Where a translation fits and how it looks there. Before a translation
// goes in, the space around its paragraph decides its form; after, its box
// is checked, and a translation that broke the page (overflowing, cut off,
// pushing its neighbours, scrolling the page sideways) gets the compact
// form. Growing taller is fine. Only read here (styles and boxes); the
// caller batches reads before writes.
import type { Paragraph } from "./blocks";
import { wordCount } from "../shared/text";
import { ARTICLE_SELECTOR, controlOf, isOwn, isTextBlock } from "./dom-rules";
import {
  clampOf,
  copiedText,
  hasMarkRoom,
  isContent,
  spacingAfter,
  startAligned,
  type LookDetails,
} from "./look";
import { originalText } from "./originals";
import {
  clipsOverflow,
  hasBackground,
  HIDDEN_BOX_PX,
  isHorizontalFlex,
  isRow,
  lineHeightOf,
} from "./styles";

// `block`: on its own line under the source. `inline`: on the same line,
// after it. `tooltip`: shown on hover (the source's title). `hidden`: the
// paragraph isn't visible (a skip link, text for screen readers only).
// `skip`: a control's label while menus and buttons aren't translated; it
// keeps its text in both displays.
export type Form = "block" | "inline" | "tooltip" | "hidden" | "skip";

export type Placement = {
  form: Form;
  // The element the translation goes into: the paragraph's block, or the
  // element around the source's wrapper or clamped box (see LookDetails'
  // anchor).
  host?: Element;
  // The table, flex or grid container the translation is laid out in: one
  // making it too wide puts the whole area in the compact form.
  area?: Element;
  // The nearest box around it that cuts off what overflows.
  clip?: Element;
  // The horizontal row (flex or grid) the translation is laid out in: the
  // host itself or the row the host is an item of. The row's other items
  // keep their widths.
  row?: Element;
  // The kind of unit (see kindOf).
  kind?: string;
  // The host's height before the translation went in.
  height?: number;
  look?: LookDetails;
};

// Ancestors whose box is about the paragraph's own: their limits are the
// paragraph's limits.
const CLOSE_DEPTH = 3;
const CLOSE_SLACK_PX = 8;
// How far up the area and the clipping box are looked for.
const AREA_DEPTH = 6;

const rank: Record<Form, number> = {
  block: 0,
  inline: 1,
  tooltip: 2,
  hidden: 3,
  skip: 4,
};
export const tighter = (a: Form, b: Form) => (rank[b] > rank[a] ? b : a);

// What the boxes close around an element allow.
type Limits = {
  // The outermost box that cuts the text to some lines or one.
  cut?: Element;
  // The outermost box that can't grow (a max height).
  boxed?: Element;
  // A box placed on top of the page (a map label, a badge on an image).
  placed: boolean;
  nowrap: boolean;
  clips: boolean;
};

function limitsOf(start: Element, view: Window): Limits {
  const limits: Limits = { placed: false, nowrap: false, clips: false };
  const height = start.getBoundingClientRect().height;
  for (
    let element: Element | null = start, depth = 0;
    element && depth < CLOSE_DEPTH && element !== start.ownerDocument.body;
    element = element.parentElement, depth++
  ) {
    if (
      depth &&
      element.getBoundingClientRect().height > height + CLOSE_SLACK_PX
    )
      break;
    const style = view.getComputedStyle(element);
    if (clampOf(style)) limits.cut = element;
    if (style.maxHeight !== "none") limits.boxed = element;
    if (/absolute|fixed/.test(style.position)) limits.placed = true;
    if (/^(nowrap|pre)$/.test(style.whiteSpace)) limits.nowrap = true;
    if (clipsOverflow(style)) limits.clips = true;
  }
  return limits;
}

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
  // A control's size and look are designed around its label: its
  // translation never goes into it (a tooltip when menus are translated).
  if (controlOf(block) || isDrawnControl(paragraph, view))
    return { form: translateMenus ? "tooltip" : "skip" };
  // A note laid over the page (cookie and newsletter prompts) is chrome.
  if (!translateMenus && isOverlay(block, view)) return { form: "skip" };
  const box = nodesBox(paragraph);
  // Visually hidden text (1px clip, off-screen skip links) stays as it is.
  if (box.width < HIDDEN_BOX_PX || box.height < HIDDEN_BOX_PX)
    return { form: "hidden" };
  let form: Form = paragraph.inline ? "inline" : "block";
  const own = limitsOf(block, view);
  // A clamped headline keeps its clamp; its translation goes after the
  // clamped box, clamped the same way, rather than into a tooltip. A short
  // label cut to one line stays as it is (tooltip).
  let anchor = paragraph.wrapper;
  let clamp: LookDetails["clamp"];
  if (own.cut) {
    const style = view.getComputedStyle(own.cut);
    clamp = clampOf(style);
    if (isContent(paragraph.source.plain, clamp, block))
      anchor = anchor?.contains(own.cut) ? anchor : own.cut;
    else form = "tooltip";
  }
  // Text placed on top of the page, or in a box that can't grow (unless
  // the translation goes after that box): its translation would land away
  // from it, or be cut off.
  if (own.placed || (own.boxed && !anchor?.contains(own.boxed)))
    form = tighter(form, "tooltip");
  const host = anchor?.parentElement ?? block;
  const hostStyle = view.getComputedStyle(host);
  const limits = anchor ? limitsOf(host, view) : own;
  if (anchor && (limits.cut || limits.boxed || limits.placed))
    form = tighter(form, "tooltip");
  // A single line that hides what overflows has no room for more text; a
  // single line that doesn't can take the translation on the same line.
  if (limits.nowrap)
    form = tighter(form, limits.clips && !anchor ? "tooltip" : "inline");
  else if (!anchor && limits.clips && !isTextBlock(block))
    form = tighter(form, "inline");
  // A flex row holding only the source: it wraps, and the translation takes
  // the next line, starting where the text starts.
  const wrap = wrapsAlone(paragraph, host, hostStyle, anchor);
  if (!wrap) form = tighter(form, ownForm(host, hostStyle));
  // An item in a horizontal row (a title next to its buttons) continues
  // its line, and wraps only when the line is full: a line of its own
  // would leave the row's other items standing beside a taller item.
  const parent = host.parentElement;
  const inRow =
    !!parent &&
    parent.childElementCount > 1 &&
    isRow(view.getComputedStyle(parent));
  if (inRow) form = tighter(form, "inline");
  // After a block-level element the same line doesn't continue: an inline
  // translation would start a line of its own (a label set as a block in
  // a radio control).
  // After the source's own box (a clamped headline) the line has ended
  // anyway: the translation takes the next one. Nodes that don't show
  // (`display: none`) don't end a line.
  const last =
    anchor ??
    paragraph.nodes.findLast(
      (node) =>
        node.nodeType === 3 || (node as Element).getClientRects().length,
    ) ??
    paragraph.nodes[paragraph.nodes.length - 1];
  if (
    form === "inline" &&
    last.nodeType === 1 &&
    !/^(inline|contents)/.test(view.getComputedStyle(last as Element).display)
  )
    form = anchor ? "block" : "tooltip";
  const rtl = hostStyle.direction === "rtl";
  const placement: Placement = {
    form,
    host,
    height: host.getBoundingClientRect().height,
    row: isRow(hostStyle) ? host : inRow ? parent! : undefined,
    kind: kindOf(paragraph, host),
    look: {
      anchor,
      wrap: wrap ? host : undefined,
      css: anchor
        ? copiedText(view.getComputedStyle(block), hostStyle)
        : undefined,
      spacing: anchor
        ? spacingAfter(anchor, view.getComputedStyle(anchor), box.bottom)
        : undefined,
      clamp: anchor && clamp ? clamp : undefined,
      link: anchor ? linkOf(block, anchor) : undefined,
      item: /flex|grid/.test(hostStyle.display),
      mark:
        startAligned(hostStyle) &&
        hasMarkRoom(host, rtl ? box.right : box.left, hostStyle, view),
    },
    ...areaOf(host, view),
  };
  placement.kind = `${groupId(placement.area ?? parent ?? host)}:${placement.kind}`;
  if (placement.area && compact.has(placement.area))
    placement.form = tighter(placement.form, "tooltip");
  return placement;
}

// A box fixed over the page, outside the article and covering part of the
// window only: a whole-window box is the page's own frame (apps that scroll
// their content in a fixed box).
const OVERLAY_MAX_SHARE = 0.5;

function isOverlay(block: Element, view: Window) {
  const body = block.ownerDocument.body;
  for (
    let element: Element | null = block;
    element && element !== body;
    element = element.parentElement
  ) {
    if (element.matches(ARTICLE_SELECTOR)) return false;
    if (view.getComputedStyle(element).position !== "fixed") continue;
    const box = element.getBoundingClientRect();
    return (
      box.width * box.height <
      view.innerWidth * view.innerHeight * OVERLAY_MAX_SHARE
    );
  }
  return false;
}

// The source's link, when the translation is outside it: clicking the
// translation follows it, without the translation being a second link.
function linkOf(block: Element, anchor: Element) {
  const link = block.closest("a[href]");
  return link && anchor.contains(link) ? link : undefined;
}

// Whether `host` is a flex row whose only content is the source (its own
// text first, or its wrapper), apart from empty boxes: an icon first
// would leave the translation's line starting before the text.
function wrapsAlone(
  paragraph: Paragraph,
  host: Element,
  style: CSSStyleDeclaration,
  anchor: Element | undefined,
) {
  if (!isHorizontalFlex(style)) return false;
  const source = new Set<Node>(anchor ? [anchor] : paragraph.nodes);
  const items = Array.from(host.childNodes).filter(
    (node) =>
      (node.nodeType === 1 && !isOwn(node)) ||
      (node.nodeType === 3 && originalText(node as Text).trim()),
  );
  const hasText = (node: Node) => !!node.textContent?.trim();
  return (
    source.has(items[0]) &&
    hasText(items[0]) &&
    items.every((node) => source.has(node) || !hasText(node))
  );
}

// Groups of units: the container their kinds are shared in.
const groups = new WeakMap<Element, number>();
let nextGroup = 1;

function groupId(element: Element) {
  let id = groups.get(element);
  if (!id) groups.set(element, (id = nextGroup++));
  return id;
}

// What kind of unit a paragraph is: its text's element and the element
// the translation goes into, by tag, role and classes. Units of one kind in
// one container (the headlines of a list of cards, the cells of a table)
// show their translations one way.
function kindOf(paragraph: Paragraph, host: Element) {
  const name = (element: Element | null) =>
    element
      ? `${element.tagName}[${element.getAttribute("role") || ""}].${[...element.classList].sort().join(".")}`
      : "";
  const outer = host === paragraph.parent ? host.parentElement : host;
  return `${name(outer)}>${name(paragraph.parent)}${paragraph.whole ? "" : "~"}`;
}

// What the element the translation goes into allows.
function ownForm(host: Element, style: CSSStyleDeclaration): Form {
  // Our element would be a new cell of the grid.
  if (/grid/.test(style.display)) return "tooltip";
  // A table header: one line.
  if (host.tagName.toUpperCase() === "TH") return "inline";
  if (/^inline/.test(style.display) || style.display === "contents")
    return "inline";
  // Our element would be a new item next to the paragraph's text.
  if (isHorizontalFlex(style)) return "inline";
  return "block";
}

// Words at most in a control's label.
const LABEL_MAX_WORDS = 6;
// A control is at most this many lines high.
const CONTROL_MAX_LINES = 3;

// A link drawn as a button (a pill, a chip): a short label in a small box
// with its own background or border.
function isDrawnControl(paragraph: Paragraph, view: Window) {
  const link = paragraph.parent.closest("a[href]");
  if (!link) return false;
  const text = paragraph.source.plain;
  if (wordCount(text) > LABEL_MAX_WORDS || /[.!?:]$/.test(text)) return false;
  const style = view.getComputedStyle(link);
  const painted =
    hasBackground(style) ||
    (parseFloat(style.borderTopWidth) > 0 &&
      style.borderTopStyle !== "none" &&
      parseFloat(style.borderBottomWidth) > 0);
  if (!painted) return false;
  return (
    link.getBoundingClientRect().height <=
    lineHeightOf(style) * CONTROL_MAX_LINES
  );
}

function areaOf(start: Element, view: Window) {
  let area: Element | undefined;
  let clip: Element | undefined;
  const body = start.ownerDocument.body;
  for (
    let element: Element | null = start, depth = 0;
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
    if (!clip && clipsOverflow(style)) clip = element;
  }
  return { area, clip };
}

// The box of the paragraph's text as the page shows it. Text inside a box
// of 1px or less (visually hidden labels, icon-only buttons) doesn't show,
// however wide the text itself is.
function nodesBox(paragraph: Paragraph) {
  let width = 0;
  let height = 0;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const range = paragraph.parent.ownerDocument.createRange();
  for (const token of paragraph.source.tokens) {
    if (token.type !== "text" || !originalText(token.node).trim()) continue;
    if (insideTinyBox(token.node, paragraph.parent)) continue;
    range.selectNodeContents(token.node);
    const box = range.getBoundingClientRect();
    width = Math.max(width, box.width);
    height = Math.max(height, box.height);
    if (box.width) {
      left = Math.min(left, box.left);
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    }
  }
  return { width, height, left, right, bottom };
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
    if (box.width < HIDDEN_BOX_PX || box.height < HIDDEN_BOX_PX) return true;
    if (isScreenReaderOnly(element)) return true;
  }
  return false;
}

// Text for screen readers laid over the page and not painted (an alternative
// text for star icons, a spoken price): fully transparent or clipped to
// nothing. Text in the flow that is transparent may be about to fade in.
function isScreenReaderOnly(element: Element) {
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);
  if (style.position !== "absolute" && style.position !== "fixed") return false;
  return (
    style.opacity === "0" || /^(circle\(0(px)?|inset\(50%)/.test(style.clipPath)
  );
}

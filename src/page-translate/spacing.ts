// The space around a block translation: a gap under its source, and space
// after it that sets the pair apart from what comes next. Only reads styles
// and boxes (see layout.ts).
import { isOwn } from "./dom-rules";
import { TRANSLATION_GAP, TRANSLATION_SPACE_AFTER } from "./render";
import { clipsOverflow, hasBackground, isBlockBox } from "./styles";

// How far up the page the space after is followed.
const SPACE_DEPTH = 8;

// The style of the translation's space: the space the page keeps under the
// source box the translation follows (`moved`, see spacingAfter), and at
// least TRANSLATION_SPACE_AFTER after it where that space joins the page's
// own margins (see separates). Where the page keeps more, its space stays;
// nothing is added to it.
export function spaceStyle(moved: number, separated: boolean) {
  const after =
    separated && moved > 0
      ? `max(${moved}px, ${TRANSLATION_SPACE_AFTER})`
      : separated
        ? TRANSLATION_SPACE_AFTER
        : moved > 0
          ? `${moved}px`
          : "";
  return [
    moved > 0 && `margin-block-start: calc(${TRANSLATION_GAP} - ${moved}px)`,
    after && `margin-block-end: ${after}`,
  ]
    .filter(Boolean)
    .join("; ");
}

// The space the page keeps under the source (the bottom padding and
// margin of the box the translation follows) moves under the translation,
// so the translation stays close to its source and what comes next keeps
// its distance. Not into a box with a background or a bottom border.
export function spacingAfter(
  anchor: Element,
  style: CSSStyleDeclaration,
  textBottom: number,
) {
  const inside =
    hasBackground(style) || parseFloat(style.borderBlockEndWidth) > 0
      ? 0
      : Math.max(0, anchor.getBoundingClientRect().bottom - textBottom);
  return Math.round(inside + (parseFloat(style.marginBlockEnd) || 0));
}

// Whether a block translation in `parent`, before `next`, sets its pair
// apart with a margin after it: only where that margin collapses with the
// page's own margins on the way to the next block of the page (a list item
// or paragraph after, or after the box around them). Margins are kept as
// they were where it wouldn't collapse: in flex and grid layouts (menus,
// rows of cards), before running text, and at the end of a box with
// padding or a border (the last item of a card), where it would add to the
// box's own space.
export function separates(parent: Element, next: Node | null) {
  const view = parent.ownerDocument.defaultView!;
  const body = parent.ownerDocument.body;
  let box: Element = parent;
  let following = next;
  for (let depth = 0; depth < SPACE_DEPTH; depth++) {
    const style = view.getComputedStyle(box);
    const contents = style.display === "contents";
    if (!contents && !flowsInBlocks(style)) return false;
    const after = firstShown(following, view);
    if (after) return after.nodeType === 1 && isBlockBox(after as Element);
    // At the end of the page there is nothing to set apart from.
    if (box === body || !box.parentElement) return false;
    if (!contents && !passesEnd(style)) return false;
    following = box.nextSibling;
    box = box.parentElement;
  }
  return false;
}

// Lays its children out as blocks one under another, their margins next to
// each other's.
function flowsInBlocks(style: CSSStyleDeclaration) {
  return /^(block|list-item|flow-root|inline-block|table-cell)$/.test(
    style.display,
  );
}

// A margin at the end of the box's last child goes through it: a block in
// the flow with nothing at its end (padding, border, a height of its own)
// that doesn't contain its children's margins.
function passesEnd(style: CSSStyleDeclaration) {
  return (
    /^(block|list-item)$/.test(style.display) &&
    !/absolute|fixed/.test(style.position) &&
    style.float === "none" &&
    !clipsOverflow(style) &&
    !parseFloat(style.paddingBlockEnd) &&
    !parseFloat(style.borderBlockEndWidth) &&
    !parseFloat(style.minHeight)
  );
}

// The next node from `node` on that shows in the flow: not blank text, a
// comment, a line break, our own element, or an element without a box or
// taken out of the flow.
function firstShown(node: Node | null, view: Window) {
  for (let current = node; current; current = current.nextSibling) {
    if (current.nodeType === 3) {
      if (current.textContent?.trim()) return current;
      continue;
    }
    if (current.nodeType !== 1 || isOwn(current) || current.nodeName === "BR")
      continue;
    const element = current as Element;
    if (!element.getClientRects().length) continue;
    if (/absolute|fixed/.test(view.getComputedStyle(element).position))
      continue;
    return element;
  }
  return null;
}

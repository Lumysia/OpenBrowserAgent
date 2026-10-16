import { compact } from "../shared/text";
import { clip, nameOf, roleOf } from "./dom";

// Where a pointer can reach an element, as a user's would: a point in its
// visible box where the element on top is the element itself, something
// inside it, an ancestor of it, or a label of it. When none is, another
// element covers it.

// Points tried, as shares of the visible box: the centre, then inner
// points around it.
const POINTS = [
  [0.5, 0.5],
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
  [0.5, 0.15],
  [0.5, 0.85],
  [0.15, 0.5],
  [0.85, 0.5],
];
const COVER_TEXT_MAX_CHARS = 60;

export type HitPoint = { x: number; y: number; cover?: Element };

// The parent across shadow boundaries.
const up = (node: Node): Node | null =>
  node.parentNode instanceof ShadowRoot
    ? node.parentNode.host
    : node.parentNode;

function contains(outer: Node, inner: Node) {
  for (let node: Node | null = inner; node; node = up(node))
    if (node === outer) return true;
  return false;
}

// The element on top at a point, inside open shadow roots.
function topAt(x: number, y: number) {
  let hit = document.elementFromPoint(x, y);
  while (hit?.shadowRoot) {
    const inner = hit.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === hit) break;
    hit = inner;
  }
  return hit;
}

function reaches(hit: Element, element: Element) {
  if (contains(element, hit) || contains(hit, element)) return true;
  const label = hit.closest("label");
  return !!label && label.control === element;
}

export function hitPoint(element: Element): HitPoint {
  const rect = element.getBoundingClientRect();
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const right = Math.min(rect.right, innerWidth);
  const bottom = Math.min(rect.bottom, innerHeight);
  const centre = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  // Out of view or without a box: nothing to test against.
  if (right <= left || bottom <= top) return centre;
  let cover: Element | null = null;
  for (const [sx, sy] of POINTS) {
    const x = left + (right - left) * sx;
    const y = top + (bottom - top) * sy;
    const hit = topAt(x, y);
    if (!hit) continue;
    if (reaches(hit, element)) return { x, y };
    cover ??= hit;
  }
  return cover ? { ...centre, cover: coverRoot(cover, element) } : centre;
}

// The cover as a whole: its outermost ancestor that does not hold the
// covered element (the overlay, not the backdrop's inner box).
function coverRoot(hit: Element, element: Element) {
  let root = hit;
  for (let node = up(hit); node instanceof Element; node = up(node)) {
    if (contains(node, element)) break;
    root = node;
  }
  return root;
}

export function coverLabel(cover: Element) {
  const role = roleOf(cover) || cover.localName;
  const name = nameOf(cover, role) || compact((cover as HTMLElement).innerText);
  return `${role}${name ? ` "${clip(name, COVER_TEXT_MAX_CHARS)}"` : ""}`;
}

// Where the subtitle layer goes: over the part of the video the user sees.
// A player often clips its <video> (a box with `overflow: hidden` around a
// video that is larger, or offset while the player lays itself out), so the
// video's own box can reach past the player; the layer follows the video's
// box cut by every ancestor that clips it (and by the viewport, for a layer
// fixed to it).

export type Box = { left: number; top: number; right: number; bottom: number };

// An ancestor that clips the video, on one axis or both.
export type Clip = { box: Box; x: boolean; y: boolean };

// Caption conventions rather than the page's look: light text on a dark
// box, sized from the visible video's height.
export const SUBTITLE_SIZE = { share: 0.03, min: 12, max: 28 } as const;
// Above the player's control bar, as a share of the visible height.
const BOTTOM_SHARE = 0.1;

// The video's box cut by its clipping ancestors (and the viewport, when
// given), or undefined when none of it shows.
export function visibleBox(video: Box, clips: Clip[], viewport?: Box) {
  let box = viewport ? intersect(video, viewport, true, true) : video;
  for (const clip of clips) box = intersect(box, clip.box, clip.x, clip.y);
  return box.right > box.left && box.bottom > box.top ? box : undefined;
}

function intersect(a: Box, b: Box, x: boolean, y: boolean): Box {
  return {
    left: x ? Math.max(a.left, b.left) : a.left,
    right: x ? Math.min(a.right, b.right) : a.right,
    top: y ? Math.max(a.top, b.top) : a.top,
    bottom: y ? Math.min(a.bottom, b.bottom) : a.bottom,
  };
}

// The layer's place relative to `origin` (the point its own box is
// positioned from, in the same coordinates as `visible`): its left edge,
// width, the distance of its bottom edge below the origin, and its font
// size.
export function layerPlacement(
  visible: Box,
  origin: { left: number; top: number },
) {
  const height = visible.bottom - visible.top;
  return {
    left: visible.left - origin.left,
    width: visible.right - visible.left,
    bottom: visible.bottom - height * BOTTOM_SHARE - origin.top,
    size: Math.min(
      SUBTITLE_SIZE.max,
      Math.max(SUBTITLE_SIZE.min, height * SUBTITLE_SIZE.share),
    ),
  };
}

// The ancestors that clip `element` (across shadow roots), with the axes
// they clip: those whose overflow isn't visible, as CSS applies them. An
// absolutely positioned box is only clipped from its containing block up, a
// fixed one only by a transformed ancestor; nothing above a fullscreen
// element clips it.
export type ClippingAncestor = { element: Element; x: boolean; y: boolean };

export function clippingAncestors(element: Element) {
  const clips: ClippingAncestor[] = [];
  let position = getComputedStyle(element).position;
  for (
    let node = parentOf(element);
    node && node !== document.documentElement;
    node = parentOf(node)
  ) {
    const style = getComputedStyle(node);
    if (!containsAs(position, style)) continue;
    const x = style.overflowX !== "visible";
    const y = style.overflowY !== "visible";
    if (x || y) clips.push({ element: node, x, y });
    if (node === document.fullscreenElement) break;
    position = style.position;
  }
  return clips;
}

// Whether a box styled `style` is the containing block (or the one above
// it) for a descendant positioned `position`.
function containsAs(position: string, style: CSSStyleDeclaration) {
  const transformed = style.transform !== "none";
  if (position === "fixed") return transformed;
  if (position === "absolute")
    return style.position !== "static" || transformed;
  return true;
}

// Elements whose children aren't laid out as boxes in them.
const NO_CHILD_BOXES = new Set([
  "AUDIO",
  "CANVAS",
  "EMBED",
  "IFRAME",
  "IMG",
  "OBJECT",
  "PICTURE",
  "SELECT",
  "TEXTAREA",
  "VIDEO",
]);

// Where a layer scrolls and moves with `video` by itself: next to it, as an
// absolutely positioned box, so the browser moves both on its own when the
// page scrolls. None for a video that moves apart from what is around it
// (fixed or sticky), a parent that can't hold another box, or a scrolling
// box between the parent and the layer's containing block (the video
// would scroll in it and the layer wouldn't).
export function layerParent(video: Element): Node | undefined {
  const parent = video.parentNode;
  if (!parent) return undefined;
  const { position } = getComputedStyle(video);
  if (position === "fixed" || position === "sticky") return undefined;
  if (
    !(parent instanceof ShadowRoot) &&
    (!(parent instanceof HTMLElement) || NO_CHILD_BOXES.has(parent.tagName))
  )
    return undefined;
  const first = parent instanceof ShadowRoot ? parent.host : parent;
  for (
    let node: Element | null = first;
    node && node !== document.documentElement;
    node = parentOf(node)
  ) {
    const style = getComputedStyle(node);
    if (containsAs("absolute", style)) return parent;
    if (
      /auto|scroll/.test(style.overflowX + style.overflowY) &&
      !scrollsViewport(node)
    )
      return undefined;
  }
  return parent;
}

// The body's overflow is the viewport's when the root element sets none.
function scrollsViewport(element: Element) {
  return (
    element === document.body &&
    getComputedStyle(document.documentElement).overflow === "visible"
  );
}

function parentOf(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

// Where the subtitle layer goes: over the part of the video the user sees.
// A player often clips its <video> (a box with `overflow: hidden` around a
// video that is larger, or offset while the player lays itself out), so the
// video's own box can reach past the player; the layer follows the video's
// box cut by every ancestor that clips it, and by the viewport.

export type Box = { left: number; top: number; right: number; bottom: number };

// An ancestor that clips the video, on one axis or both.
export type Clip = { box: Box; x: boolean; y: boolean };

// Caption conventions rather than the page's look: light text on a dark
// box, sized from the visible video's height.
const SIZE = { share: 0.042, min: 12, max: 34 } as const;
// Above the player's control bar, as a share of the visible height.
const BOTTOM_SHARE = 0.1;

// The video's box cut by its clipping ancestors and the viewport, or
// undefined when none of it shows.
export function visibleBox(video: Box, clips: Clip[], viewport: Box) {
  let box = intersect(video, viewport, true, true);
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

// The layer's place in the viewport (`position: fixed`) and its font size.
export function layerPlacement(visible: Box, viewportHeight: number) {
  const height = visible.bottom - visible.top;
  return {
    left: visible.left,
    width: visible.right - visible.left,
    bottom: viewportHeight - visible.bottom + height * BOTTOM_SHARE,
    size: Math.min(SIZE.max, Math.max(SIZE.min, height * SIZE.share)),
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
    const transformed = style.transform !== "none";
    const containing =
      position === "fixed"
        ? transformed
        : position !== "absolute" || style.position !== "static" || transformed;
    if (!containing) continue;
    const x = style.overflowX !== "visible";
    const y = style.overflowY !== "visible";
    if (x || y) clips.push({ element: node, x, y });
    if (node === document.fullscreenElement) break;
    position = style.position;
  }
  return clips;
}

function parentOf(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

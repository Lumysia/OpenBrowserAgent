import type { Rect } from "./selection";

// Between the bar and the selection, and between the bar and the window's
// edges.
const SMART_BAR_GAP = 8;
export const SMART_BAR_MARGIN = 8;
// Half a line of text in a field: the anchor at the mouse in a text control.
const HALF_LINE_PX = 12;

export type Placement = {
  left: number;
  top: number;
  // Which side of the anchor the bar is on.
  side: "below" | "above";
  // Where the anchor's centre is, from the bar's left edge.
  originX: number;
  offscreen: boolean;
};

// Below the anchor at `x` (else centred), above it when there is no room
// below, always kept inside the viewport. `offscreen`: the anchor itself
// has scrolled out of view.
export function placeSmartBar({
  anchor,
  x,
  size,
  viewport,
}: {
  anchor: Rect;
  x?: number;
  size: { width: number; height: number };
  viewport: { width: number; height: number };
}): Placement {
  const clamp = (value: number, max: number) =>
    Math.max(SMART_BAR_MARGIN, Math.min(value, max - SMART_BAR_MARGIN));
  const centre = x ?? (anchor.left + anchor.right) / 2;
  const left = clamp(centre - size.width / 2, viewport.width - size.width);
  const below = anchor.bottom + SMART_BAR_GAP;
  const above = anchor.top - SMART_BAR_GAP - size.height;
  const fitsBelow = below + size.height <= viewport.height - SMART_BAR_MARGIN;
  const side = fitsBelow || above < SMART_BAR_MARGIN ? "below" : "above";
  const top =
    side === "below" ? clamp(below, viewport.height - size.height) : above;
  return {
    left,
    top,
    side,
    originX: Math.max(0, Math.min(size.width, centre - left)),
    offscreen: anchor.bottom < 0 || anchor.top > viewport.height,
  };
}

// The anchor for a snapshot: the selected text, or for text controls (whose
// selection has no box) a line at the mouse within the field, kept relative
// to the field as it scrolls.
export function anchorRect(
  base: Rect,
  pointOffset: { x: number; y: number } | undefined,
  controlLine: boolean,
): Rect {
  if (!controlLine || !pointOffset) return base;
  const y = base.top + pointOffset.y;
  return {
    left: base.left + pointOffset.x,
    right: base.left + pointOffset.x,
    top: y - HALF_LINE_PX,
    bottom: y + HALF_LINE_PX,
  };
}

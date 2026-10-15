// Where the page button sits: always on one of the viewport's edges, its
// middle at a stored fraction along that edge (see PageButtonPosition).
// Pure, so the drag and the keyboard share it and tests can pin it.
import {
  PAGE_BUTTON_EDGES,
  type PageButtonEdge,
  type PageButtonPosition,
} from "../shared/page-translate/button";

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

// The order the "next edge" key goes round: clockwise.
const CLOCKWISE: Record<PageButtonEdge, PageButtonEdge> = {
  top: "right",
  right: "bottom",
  bottom: "left",
  left: "top",
};

// One arrow key press moves it this far along its edge.
export const KEY_STEP = 0.05;

const vertical = (edge: PageButtonEdge) => edge === "left" || edge === "right";

const clamp = (value: number, min: number, max: number) =>
  max < min ? (min + max) / 2 : Math.min(max, Math.max(min, value));

// The button's middle on its edge, kept `margin` px from the corners so the
// whole button stays inside the viewport at any size.
export function edgePoint(
  { edge, along }: PageButtonPosition,
  viewport: Size,
  margin: number,
): Point {
  const length = vertical(edge) ? viewport.height : viewport.width;
  const offset = clamp(along * length, margin, length - margin);
  switch (edge) {
    case "left":
      return { x: 0, y: offset };
    case "right":
      return { x: viewport.width, y: offset };
    case "top":
      return { x: offset, y: 0 };
    case "bottom":
      return { x: offset, y: viewport.height };
  }
}

// A free point (where a drag let go) to the nearest edge, keeping its place
// along that edge.
export function snapToEdge(point: Point, viewport: Size): PageButtonPosition {
  const distances: Record<PageButtonEdge, number> = {
    left: point.x,
    right: viewport.width - point.x,
    top: point.y,
    bottom: viewport.height - point.y,
  };
  const edge = PAGE_BUTTON_EDGES.reduce((nearest, candidate) =>
    distances[candidate] < distances[nearest] ? candidate : nearest,
  );
  const along = vertical(edge)
    ? point.y / viewport.height
    : point.x / viewport.width;
  return { edge, along: clamp(along || 0, 0, 1) };
}

// Inside the viewport, `margin` px from its sides: where a drag can take it.
export function clampPoint(point: Point, viewport: Size, margin: number) {
  return {
    x: clamp(point.x, margin, viewport.width - margin),
    y: clamp(point.y, margin, viewport.height - margin),
  };
}

// The arrow key that moves the button along its edge: -1 back (up, left),
// 1 forward (down, right), 0 for keys across it.
export function keyDirection(edge: PageButtonEdge, key: string) {
  const [back, forward] = vertical(edge)
    ? ["ArrowUp", "ArrowDown"]
    : ["ArrowLeft", "ArrowRight"];
  return key === back ? -1 : key === forward ? 1 : 0;
}

export function moveAlong(
  position: PageButtonPosition,
  steps: number,
): PageButtonPosition {
  return {
    edge: position.edge,
    along: clamp(position.along + steps * KEY_STEP, 0, 1),
  };
}

export function nextEdge(position: PageButtonPosition): PageButtonPosition {
  return { edge: CLOCKWISE[position.edge], along: position.along };
}

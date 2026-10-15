// Moving the page button: a drag with any pointer (mouse, pen, touch)
// follows it freely and lets go onto the nearest edge; the arrow keys move
// it along its edge and E to the next edge. A press that hardly moves is a
// click. Only the user's own input counts.
import type { PageButtonPosition } from "../shared/page-translate/button";
import {
  clampPoint,
  keyDirection,
  moveAlong,
  nextEdge,
  snapToEdge,
  type Point,
  type Size,
} from "./geometry";

// A press that moves further than this drags the button instead.
const DRAG_THRESHOLD_PX = 4;
// Moves the button to the next edge (with the arrow keys along it).
export const NEXT_EDGE_KEY = "e";

export type DragPoint = Point;

export type DragOptions = {
  // How far the button's middle stays from the viewport's sides.
  margin(): number;
  viewport(): Size;
  // Where it is; undefined while it isn't shown.
  current(): PageButtonPosition | undefined;
  // During a drag: where its middle is now.
  move(point: DragPoint): void;
  // Its new place, after a drag or a key.
  drop(position: PageButtonPosition): void;
  click(): void;
};

export function attachDrag(button: HTMLElement, options: DragOptions) {
  let press:
    | { pointerId: number; start: Point; offset: Point; point?: Point }
    | undefined;
  // The click that ends a drag isn't one.
  let dragged = false;

  button.addEventListener("pointerdown", (event) => {
    if (!event.isTrusted || event.button !== 0) return;
    dragged = false;
    const rect = button.getBoundingClientRect();
    press = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      offset: {
        x: event.clientX - (rect.left + rect.width / 2),
        y: event.clientY - (rect.top + rect.height / 2),
      },
    };
    button.setPointerCapture(event.pointerId);
  });

  button.addEventListener("pointermove", (event) => {
    if (!event.isTrusted || event.pointerId !== press?.pointerId) return;
    const { start, offset } = press;
    if (
      !press.point &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) <
        DRAG_THRESHOLD_PX
    )
      return;
    press.point = clampPoint(
      { x: event.clientX - offset.x, y: event.clientY - offset.y },
      options.viewport(),
      options.margin(),
    );
    options.move(press.point);
  });

  const end = (event: PointerEvent) => {
    if (event.pointerId !== press?.pointerId) return;
    const point = press.point;
    press = undefined;
    if (!point) return;
    dragged = true;
    options.drop(snapToEdge(point, options.viewport()));
  };
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);

  button.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    if (dragged) {
      dragged = false;
      return;
    }
    options.click();
  });

  button.addEventListener("keydown", (event) => {
    const position = options.current();
    if (!event.isTrusted || !position || press) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = keyDirection(position.edge, event.key);
    if (direction) options.drop(moveAlong(position, direction));
    else if (event.key.toLowerCase() === NEXT_EDGE_KEY)
      options.drop(nextEdge(position));
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
}

import { centerOf } from "./dom";
import { coverLabel, hitPoint } from "./hit-point";
import { refFor, resolveRef } from "./refs";
import { describe, failed, ok, reveal, type StepResult } from "./step-result";

// Pointer steps (click, hover, drag) with synthetic events, and the point
// trusted pointer input uses. A pointer reaches only an element on top: a
// covered one fails the step unless the step forces it.

type PointerTarget =
  { point: { x: number; y: number }; note?: string } | { error: string };

// Where the pointer goes for an element, scrolled into view unless
// `scroll` is false: a point where it is on top, or an error naming what
// covers it. `force` takes the centre, covered or not.
function pointerTarget(
  element: Element,
  force: boolean,
  scroll = true,
): PointerTarget {
  if (scroll) reveal(element);
  const point = hitPoint(element);
  const { x, y, cover } = point;
  if (!cover) return { point: { x, y } };
  if (force)
    return {
      point: { x, y },
      note: `covered by ${coverLabel(cover)}; acted on it anyway`,
    };
  return {
    error: `${describe(element)} [${refFor(element)}] is covered by ${coverLabel(cover)} [${refFor(cover)}]. Close or scroll the cover away first, or act on the cover if it is the real control.`,
  };
}

function mouseInit({ x, y }: { x: number; y: number }) {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
  };
}

function pointer(element: Element, type: string, init: MouseEventInit) {
  element.dispatchEvent(
    new PointerEvent(type, {
      ...init,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }),
  );
}

export function click(
  element: Element,
  double: boolean,
  force: boolean,
): StepResult {
  if ((element as HTMLButtonElement).disabled)
    return failed(
      `${describe(element)} is disabled. Complete the required fields first, or snapshot to see why.`,
    );
  const target = pointerTarget(element, force);
  if ("error" in target) return failed(target.error);
  const init = mouseInit(target.point);
  if (element instanceof HTMLElement) element.focus({ preventScroll: true });
  pointer(element, "pointerover", init);
  for (let detail = 1; detail <= (double ? 2 : 1); detail++) {
    const press = { ...init, detail };
    pointer(element, "pointerdown", { ...press, buttons: 1 });
    element.dispatchEvent(
      new MouseEvent("mousedown", { ...press, buttons: 1 }),
    );
    pointer(element, "pointerup", press);
    element.dispatchEvent(new MouseEvent("mouseup", press));
    element.dispatchEvent(new MouseEvent("click", press));
  }
  if (double)
    element.dispatchEvent(new MouseEvent("dblclick", { ...init, detail: 2 }));
  return ok(target.note);
}

export function hover(element: Element, force: boolean): StepResult {
  const target = pointerTarget(element, force);
  if ("error" in target) return failed(target.error);
  const init = mouseInit(target.point);
  pointer(element, "pointerover", init);
  pointer(element, "pointerenter", { ...init, bubbles: false });
  element.dispatchEvent(new MouseEvent("mouseover", init));
  element.dispatchEvent(
    new MouseEvent("mouseenter", { ...init, bubbles: false }),
  );
  element.dispatchEvent(new MouseEvent("mousemove", init));
  return ok(target.note);
}

// Where trusted (debugger) input should land for an element, in viewport
// coordinates, after scrolling it into view: for keys, focused; for the
// mouse, a point where it is on top, or an error naming its cover.
export function inputPoint(
  ref: string,
  options: { focus?: boolean; pointer?: boolean; force?: boolean },
): { x: number; y: number; error?: string } {
  const element = resolveRef(ref);
  if (options.pointer) {
    const target = pointerTarget(element, options.force === true);
    return "error" in target
      ? { ...centerOf(element), error: target.error }
      : target.point;
  }
  reveal(element);
  if (options.focus && element instanceof HTMLElement)
    element.focus({ preventScroll: true });
  return centerOf(element);
}

export function drag(
  source: Element,
  target: Element,
  force: boolean,
): StepResult {
  const start = pointerTarget(source, force);
  if ("error" in start) return failed(start.error);
  // Scrolling to the target would move the source.
  const end = pointerTarget(target, force, false);
  if ("error" in end) return failed(end.error);
  const from = mouseInit(start.point);
  const to = mouseInit(end.point);
  const data = new DataTransfer();
  pointer(source, "pointerdown", { ...from, buttons: 1 });
  source.dispatchEvent(new MouseEvent("mousedown", { ...from, buttons: 1 }));
  source.dispatchEvent(
    new DragEvent("dragstart", { ...from, dataTransfer: data }),
  );
  target.dispatchEvent(
    new DragEvent("dragenter", { ...to, dataTransfer: data }),
  );
  target.dispatchEvent(
    new DragEvent("dragover", { ...to, dataTransfer: data }),
  );
  pointer(target, "pointermove", { ...to, buttons: 1 });
  target.dispatchEvent(new MouseEvent("mousemove", { ...to, buttons: 1 }));
  target.dispatchEvent(new DragEvent("drop", { ...to, dataTransfer: data }));
  source.dispatchEvent(new DragEvent("dragend", { ...to, dataTransfer: data }));
  pointer(target, "pointerup", to);
  target.dispatchEvent(new MouseEvent("mouseup", to));
  return ok(start.note || end.note);
}

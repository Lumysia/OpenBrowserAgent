// Element refs ("e12") shared by every page tool. A ref names one element
// for as long as it exists and is never given to another element: the
// counter continues from a floor the background keeps across documents and
// tabs. Elements picked in the side panel carry a "sel-…" ref instead.

const byRef = new Map<string, WeakRef<Element>>();
const byElement = new WeakMap<Element, string>();
let counter = 0;

export class RefError extends Error {}

export function raiseFloor(floor: unknown) {
  const value = Number(floor);
  if (Number.isFinite(value) && value > counter) counter = Math.trunc(value);
}

export function refCounter() {
  return counter;
}

export function refFor(element: Element) {
  const existing = byElement.get(element);
  if (existing) return existing;
  const ref = `e${++counter}`;
  byElement.set(element, ref);
  byRef.set(ref, new WeakRef(element));
  return ref;
}

export function resolveRef(value: unknown): Element {
  const ref = String(value ?? "").trim();
  if (!ref)
    throw new RefError("A ref is required. Take a snapshot to get refs.");
  if (ref.startsWith("sel-")) {
    const selected = document.querySelector(
      `[data-oba-selection="${CSS.escape(ref)}"]`,
    );
    if (!selected)
      throw new RefError(
        `The selected element ${ref} is no longer on this page. Take a snapshot.`,
      );
    return selected;
  }
  const entry = byRef.get(ref);
  if (!entry)
    throw new RefError(
      `Ref ${ref} is not on this page: the page navigated or reloaded, or the ref is from another tab. Take a new snapshot and use its refs.`,
    );
  const element = entry.deref();
  if (!element?.isConnected)
    throw new RefError(
      `Ref ${ref} is stale: that element is no longer on the page. Take a new snapshot (or use find) and use the new ref.`,
    );
  return element;
}

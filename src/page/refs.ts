import { HEADING_SELECTOR } from "../shared/dom-vocabulary";
import {
  clip,
  CONTAINER_ROLES,
  CONTROL_CANDIDATES,
  isHidden,
  isInteractive,
  nameOf,
  roleOf,
} from "./dom";

// Element refs ("e12") shared by every page tool. A ref names one element
// for as long as it exists and is never given to another element: the
// counter continues from a floor the background keeps across documents and
// tabs. Elements picked in the side panel carry a "sel-…" ref instead.
//
// A control's ref also keeps what the control means (role, name and the
// container it sits in), so a ref whose element the page re-rendered finds
// the one identical element that replaced it.

type Meaning = { role: string; name: string; container: string };
type Entry = { element: WeakRef<Element>; meaning?: Meaning };

const byRef = new Map<string, Entry>();
const byElement = new WeakMap<Element, string>();
let counter = 0;
// What resolving refs had to work around, for the step's result.
let notes: string[] = [];

const NAME_MAX = 60;
const CANDIDATES_LISTED = 3;

export class RefError extends Error {}

export function raiseFloor(floor: unknown) {
  const value = Number(floor);
  if (Number.isFinite(value) && value > counter) counter = Math.trunc(value);
}

export function refCounter() {
  return counter;
}

// The nearest container around an element, as "role name". Many controls
// share a container: its description is kept.
const containers = new WeakMap<Element, string>();
function containerOf(element: Element) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const known = containers.get(node);
    if (known !== undefined) {
      if (known) return known;
      continue;
    }
    const role = roleOf(node);
    const described = CONTAINER_ROLES.has(role)
      ? `${role} ${nameOf(node, role)}`
      : "";
    containers.set(node, described);
    if (described) return described;
  }
  return "";
}

function meaningOf(element: Element): Meaning | undefined {
  const role = roleOf(element);
  if (!isInteractive(element, role) && role !== "heading") return undefined;
  const name = nameOf(element, role);
  if (!name) return undefined;
  return { role, name, container: containerOf(element) };
}

export function refFor(element: Element) {
  const existing = byElement.get(element);
  if (existing) return existing;
  const ref = `e${++counter}`;
  byElement.set(element, ref);
  byRef.set(ref, {
    element: new WeakRef(element),
    meaning: meaningOf(element),
  });
  return ref;
}

// Visible elements on the page now with the same role (and name, when
// given); those in the same container first.
function matching(meaning: Meaning, byName: boolean) {
  const selector =
    meaning.role === "heading" ? HEADING_SELECTOR : CONTROL_CANDIDATES;
  const same = Array.from(document.querySelectorAll(selector)).filter(
    (element) =>
      roleOf(element) === meaning.role &&
      (!byName || nameOf(element, meaning.role) === meaning.name) &&
      !isHidden(element),
  );
  const inContainer = same.filter(
    (element) => containerOf(element) === meaning.container,
  );
  return inContainer.length || !byName ? inContainer : same;
}

const listed = (elements: Element[]) =>
  elements
    .slice(0, CANDIDATES_LISTED)
    .map(
      (element) =>
        `${roleOf(element)} "${clip(nameOf(element), NAME_MAX)}" [${refFor(element)}]`,
    )
    .join(", ") + (elements.length > CANDIDATES_LISTED ? ", …" : "");

function rebind(ref: string, meaning: Meaning) {
  const found = matching(meaning, true);
  if (found.length === 1) {
    notes.push(
      `ref ${ref} was re-rendered; used the matching ${listed(found)}`,
    );
    return found[0];
  }
  if (found.length)
    throw new RefError(
      `Ref ${ref} is stale: the page re-rendered it, and ${found.length} elements match it now: ${listed(found)}. Use the right one's ref.`,
    );
  // Same role where it was: the control may have been renamed.
  const nearby = meaning.container ? matching(meaning, false) : [];
  throw new RefError(
    `Ref ${ref} is stale: that element is no longer on the page, and no ${meaning.role} "${clip(meaning.name, NAME_MAX)}" replaced it.${nearby.length ? ` In its place now: ${listed(nearby)}.` : ""} Take a new snapshot (or use find) and use the new ref.`,
  );
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
  const element = entry.element.deref();
  if (element?.isConnected) return element;
  if (entry.meaning) return rebind(ref, entry.meaning);
  throw new RefError(
    `Ref ${ref} is stale: that element is no longer on the page. Take a new snapshot (or use find) and use the new ref.`,
  );
}

// Notes from resolving refs since the last call.
export function takeRefNotes() {
  const taken = notes;
  notes = [];
  return taken;
}

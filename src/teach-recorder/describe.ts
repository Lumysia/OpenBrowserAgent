import { containerOf } from "../page/container";
import { clip, isInteractive, namedFrom, roleOf } from "../page/dom";
import { structuralPath } from "../page/structural-path";
import { HEADING_SELECTOR } from "../shared/dom-vocabulary";
import { editingHost } from "../shared/dom-vocabulary";
import type { FieldSignals } from "../shared/teach/secret-fields";
import { TEACH_LIMITS, type TeachTarget } from "../shared/teach/types";
import { stableAttribute, urlPattern } from "../shared/teach/urls";
import { compact } from "../shared/text";

// What a recorded step's element is, by meaning: the role and name the
// agent's snapshot gives it (page/dom.ts), its label, placeholder, name and
// id attributes, where a link goes, its container and nearest heading. Never
// its value or anything the user typed.

const short = (value: string | null | undefined) =>
  clip(compact(value), TEACH_LIMITS.nameChars);

// Inputs that are buttons; every other input is a field.
const BUTTON_INPUT_TYPES = new Set(["button", "submit", "reset", "image"]);

// A form control the user fills or sets (its change is recorded, not the
// click into it).
export function isFormField(element: Element) {
  if (element instanceof HTMLInputElement)
    return !BUTTON_INPUT_TYPES.has(element.type);
  return (
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    editingHost(element) === element
  );
}

// The field a label belongs to, if it is one.
function labelledField(element: Element) {
  const control = element instanceof HTMLLabelElement ? element.control : null;
  return control && isFormField(control) ? control : undefined;
}

function labelOf(element: Element) {
  const labels = (element as HTMLInputElement).labels;
  return labels
    ? short(
        Array.from(labels)
          .map((label) => label.textContent)
          .join(" "),
      )
    : "";
}

// The last heading before the element in its section, or one in an
// enclosing section: what the user would say the control is "under".
function headingNear(element: Element) {
  for (
    let node: Element | null = element;
    node && node !== document.body;
    node = node.parentElement
  ) {
    for (
      let sibling = node.previousElementSibling;
      sibling;
      sibling = sibling.previousElementSibling
    ) {
      const heading = sibling.matches(HEADING_SELECTOR)
        ? sibling
        : Array.from(sibling.querySelectorAll(HEADING_SELECTOR)).at(-1);
      const text = short(heading?.textContent);
      if (text) return text;
    }
  }
  return "";
}

export function describeElement(element: Element): TeachTarget {
  const role = roleOf(element);
  const named = namedFrom(element, role);
  const link = element.closest("a[href]") as HTMLAnchorElement | null;
  const target: TeachTarget = {
    role,
    // A link named only by where it goes: `href` says that, cleaned.
    name: named.from === "href" ? "" : short(named.name),
    tag: element.localName,
  };
  const label = labelOf(element);
  const placeholder = short(element.getAttribute("placeholder"));
  const nameAttribute = stableAttribute(element.getAttribute("name"));
  const id = stableAttribute(element.id);
  const href = link ? urlPattern(link.href) : "";
  const container = short(containerOf(element));
  const heading = headingNear(element);
  return {
    ...target,
    ...(label ? { label } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(nameAttribute ? { nameAttribute } : {}),
    ...(id ? { id } : {}),
    ...(href ? { href } : {}),
    ...(container ? { container } : {}),
    ...(heading && heading !== target.name ? { heading } : {}),
    path: structuralPath(element),
  };
}

// The element a click acted on: the nearest control on the event's path
// (through shadow roots), or the clicked element when it has a short text
// of its own; undefined for a click into a field (its change is recorded)
// or on nothing in particular.
export function clickedElement(path: EventTarget[]) {
  const elements = path.filter(
    (node): node is Element => node instanceof Element,
  );
  for (const element of elements) {
    if (element === document.body || element === document.documentElement)
      break;
    if (isFormField(element) || labelledField(element)) return undefined;
    if (isInteractive(element)) return element;
  }
  const first = elements[0];
  if (!first || first === document.body) return undefined;
  const text = compact((first as HTMLElement).innerText);
  return text && text.length <= TEACH_LIMITS.nameChars ? first : undefined;
}

// What the secret-field rules read from a field.
export function fieldSignals(
  element: Element,
  target: TeachTarget,
  wasPassword: boolean,
): FieldSignals {
  return {
    tag: element.localName,
    type: element.getAttribute("type") || undefined,
    autocomplete: element.getAttribute("autocomplete") || undefined,
    id: element.id || undefined,
    name: element.getAttribute("name") || undefined,
    label:
      [target.label, target.name, element.getAttribute("aria-label")]
        .filter(Boolean)
        .join(" ") || undefined,
    placeholder: target.placeholder,
    wasPassword,
  };
}

// What kind of field it is, for the skill: an input's type, or the tag.
export function inputTypeOf(element: Element) {
  if (element instanceof HTMLInputElement) return element.type;
  if (editingHost(element) === element) return "rich-text";
  return element.localName;
}

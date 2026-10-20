import {
  isSecretField,
  type FieldSignals,
} from "../shared/teach/secret-fields";
import { compact } from "../shared/text";
import { namedFrom, roleOf } from "./dom";

// Reads a form field's secret-field signals (shared/teach/secret-fields.ts)
// from the page, so the recorder, the agent's snapshot and its actions
// decide "secret" by one rule.

const MASK_PROPERTY = "-webkit-text-security";

function labelsText(element: Element) {
  const labels = (element as HTMLInputElement).labels;
  return labels
    ? compact(
        Array.from(labels)
          .map((label) => label.textContent)
          .join(" "),
      )
    : "";
}

// The page hides what is typed with CSS instead of type=password.
function isMasked(element: Element) {
  const value = getComputedStyle(element).getPropertyValue(MASK_PROPERTY);
  return !!value && value.trim() !== "none";
}

export function secretFieldSignals(
  element: Element,
  wasPassword = false,
): FieldSignals {
  const attribute = (name: string) => element.getAttribute(name) || undefined;
  return {
    tag: element.localName,
    type: attribute("type"),
    autocomplete: attribute("autocomplete"),
    id: element.id || undefined,
    name: attribute("name"),
    label:
      [
        labelsText(element),
        namedFrom(element, roleOf(element)).name,
        attribute("aria-label"),
      ]
        .filter(Boolean)
        .join(" ") || undefined,
    placeholder: attribute("placeholder"),
    masked: isMasked(element),
    wasPassword,
  };
}

export function isSecretElement(element: Element, wasPassword = false) {
  return isSecretField(secretFieldSignals(element, wasPassword));
}

// What the agent is shown of a field's value: masked when the field is
// secret.
export const SECRET_VALUE_MASK = "•••";

export function shownFieldValue(element: Element, value: string) {
  return value && isSecretElement(element) ? SECRET_VALUE_MASK : value;
}

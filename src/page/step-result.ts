import { clip, nameOf, roleOf } from "./dom";

// What every `act` step returns, and how steps name the elements they act
// on.

export type StepResult = {
  ok: boolean;
  error?: string;
  note?: string;
  // Typing that the page rejected; the background retries with trusted input.
  trusted?: boolean;
};

export const ok = (note?: string): StepResult => ({
  ok: true,
  ...(note ? { note } : {}),
});
export const failed = (error: string): StepResult => ({ ok: false, error });

// Characters of an element's name or a field's value quoted in a result.
export const QUOTE_MAX_CHARS = 60;

export function describe(element: Element) {
  const role = roleOf(element) || element.localName;
  const name = clip(nameOf(element, role), QUOTE_MAX_CHARS);
  return `${role}${name ? ` "${name}"` : ""}`;
}

export function reveal(element: Element) {
  element.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "instant",
  });
}

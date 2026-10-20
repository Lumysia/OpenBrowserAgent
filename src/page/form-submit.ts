import type { ActStep } from "./actions";
import { refFor, resolveRef } from "./refs";

// Whether an act step would submit a form, read from the page's structure
// only: a submit button (a <button> is one unless its type says otherwise)
// or submit input, clicked or pressed; Enter in an input of a form (the
// agent's own Enter submits the input's form, as browsers do for text
// fields). A script that submits the form from some other control is not
// visible here.

// The form a click on `element` submits: it is (or is inside) a submit
// button or submit input of a form.
function submittedByClick(element: Element) {
  const control = element.closest("button, input");
  if (control instanceof HTMLButtonElement)
    return control.type === "submit" && !control.disabled ? control.form : null;
  if (
    control instanceof HTMLInputElement &&
    (control.type === "submit" || control.type === "image") &&
    !control.disabled
  )
    return control.form;
  return null;
}

// The form Enter in `element` submits.
function submittedByEnter(element: Element) {
  return (
    submittedByClick(element) ||
    (element instanceof HTMLInputElement ? element.form : null)
  );
}

// The focused element, through open shadow roots.
function focused() {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement)
    element = element.shadowRoot.activeElement;
  return element && element !== document.body ? element : null;
}

function stepElement(step: ActStep & { x?: number; y?: number }) {
  if (step.ref) return resolveRef(step.ref);
  if (typeof step.x === "number" && typeof step.y === "number")
    return document.elementFromPoint(step.x, step.y);
  return step.action === "press" ? focused() : null;
}

const isEnter = (key: string | undefined) =>
  !!key && key.split("+").at(-1) === "Enter";

function submittedBy(step: ActStep, element: Element) {
  switch (step.action) {
    case "click":
      return submittedByClick(element);
    case "type":
      return step.submit === true ? submittedByEnter(element) : null;
    case "press":
      if (isEnter(step.key)) return submittedByEnter(element);
      return step.key === " " ? submittedByClick(element) : null;
  }
  return null;
}

// The ref of the control or field through which the step would submit a
// form, or null.
export function submittingRef(step: ActStep & { x?: number; y?: number }) {
  const element = stepElement(step);
  return element && submittedBy(step, element) ? refFor(element) : null;
}

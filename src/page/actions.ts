import { editingHost } from "../shared/dom-vocabulary";
import { compact } from "../shared/text";
import { centerOf, clip, nameOf, roleOf } from "./dom";
import { RefError, resolveRef } from "./refs";

// One `act` step, run in the page. The background drives the batch: it
// stops at the first failure, waits between steps, and handles navigation.

export type ActStep = {
  action: string;
  ref?: string;
  text?: string;
  key?: string;
  value?: string;
  to?: string;
  direction?: string;
  clear?: boolean;
  submit?: boolean;
  double?: boolean;
};

export type StepResult = {
  ok: boolean;
  error?: string;
  note?: string;
  // Typing that the page rejected; the background retries with trusted input.
  trusted?: boolean;
};

const ok = (note?: string): StepResult => ({
  ok: true,
  ...(note ? { note } : {}),
});
const failed = (error: string): StepResult => ({ ok: false, error });

export function runStep(step: ActStep): StepResult | Promise<StepResult> {
  try {
    switch (step.action) {
      case "click":
        return click(resolveRef(step.ref), step.double === true);
      case "type":
        return type(
          resolveRef(step.ref),
          step.text ?? "",
          step.clear !== false,
          step.submit === true,
        );
      case "press":
        return press(
          step.ref ? resolveRef(step.ref) : focused(),
          step.key || "Enter",
        );
      case "select":
        return select(resolveRef(step.ref), step.value ?? step.text ?? "");
      case "hover":
        return hover(resolveRef(step.ref));
      case "scroll":
        return scroll(
          step.ref ? resolveRef(step.ref) : undefined,
          step.direction,
        );
      case "drag":
        return drag(resolveRef(step.ref), resolveRef(step.to));
      default:
        return failed(
          `Unknown action "${step.action}". Use click, type, press, select, hover, scroll, drag or wait.`,
        );
    }
  } catch (error) {
    if (error instanceof RefError) return failed(error.message);
    return failed(error instanceof Error ? error.message : String(error));
  }
}

function focused() {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active : document.body;
}

export function describe(element: Element) {
  const role = roleOf(element) || element.localName;
  const name = clip(nameOf(element, role), 60);
  return `${role}${name ? ` "${name}"` : ""}`;
}

function reveal(element: Element) {
  element.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "instant",
  });
}

function mouseInit(element: Element) {
  const { x, y } = centerOf(element);
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

function click(element: Element, double: boolean): StepResult {
  if ((element as HTMLButtonElement).disabled)
    return failed(
      `${describe(element)} is disabled. Complete the required fields first, or snapshot to see why.`,
    );
  reveal(element);
  const init = mouseInit(element);
  const hit = document.elementFromPoint(init.clientX, init.clientY);
  const covered =
    hit && hit !== element && !element.contains(hit) && !hit.contains(element)
      ? `covered by ${describe(hit)}; clicked it anyway`
      : undefined;
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
  return ok(covered);
}

function hover(element: Element): StepResult {
  reveal(element);
  const init = mouseInit(element);
  pointer(element, "pointerover", init);
  pointer(element, "pointerenter", { ...init, bubbles: false });
  element.dispatchEvent(new MouseEvent("mouseover", init));
  element.dispatchEvent(
    new MouseEvent("mouseenter", { ...init, bubbles: false }),
  );
  element.dispatchEvent(new MouseEvent("mousemove", init));
  return ok();
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  // The prototype setter keeps React's value tracker in sync, so the input
  // event that follows is not swallowed as a no-op.
  Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    "value",
  )!.set!.call(element, value);
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      data: value,
      inputType: "insertText",
    }),
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function type(
  element: Element,
  text: string,
  clear: boolean,
  submit: boolean,
): StepResult | Promise<StepResult> {
  reveal(element);
  if (element instanceof HTMLSelectElement)
    return failed(
      `${describe(element)} is a select. Use action "select" with the option text.`,
    );
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    if (element.disabled || element.readOnly)
      return failed(`${describe(element)} is not editable.`);
    element.focus({ preventScroll: true });
    const next = clear ? text : element.value + text;
    setNativeValue(element, next);
    // Number fields normalize their value ("1.50" -> "1.5") but empty it
    // when the text is not a number.
    const rejected =
      element.type === "number"
        ? next.trim() !== "" && element.value === ""
        : element.value !== next;
    if (rejected)
      return failed(
        `${describe(element)} did not accept the text (value is now "${clip(element.value, 60)}").`,
      );
    return submit ? press(element, "Enter") : ok();
  }
  const host = editingHost(element);
  if (!host)
    return failed(
      `${describe(element)} is not a text field. Use the ref of a textbox (snapshot or find shows them).`,
    );
  return typeInEditor(host, text, clear, submit);
}

// Editable content goes through the browser's input steps: the editor
// first gets a cancelable `beforeinput`. Editors that keep their own model
// of the text cancel it and insert the text themselves; otherwise the
// browser's own insertion runs. The text must then show in the editor once
// it has rendered, else trusted (debugger) input types it.
async function typeInEditor(
  host: HTMLElement,
  text: string,
  clear: boolean,
  submit: boolean,
): Promise<StepResult> {
  host.focus({ preventScroll: true });
  selectContents(host, clear);
  // Editors read the selection when the page reports it changed.
  await nextTask();
  const handled = !host.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType: "insertText",
      data: text,
    }),
  );
  const inserted = handled || document.execCommand("insertText", false, text);
  await nextTask();
  if (inserted && compact(host.innerText).includes(compact(text)))
    return submit ? press(host, "Enter") : ok();
  // The editor took the text but doesn't show it: typing it again could
  // add it twice, unless it replaces the editor's content.
  if (handled && !clear)
    return failed(
      `${describe(host)} did not show the text. Take a snapshot to see what it holds.`,
    );
  return { ok: false, trusted: true };
}

function selectContents(host: HTMLElement, clear: boolean) {
  const range = document.createRange();
  range.selectNodeContents(host);
  if (!clear) range.collapse(false);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
}

// After the page's pending tasks (selection reports, renders scheduled by
// the editor). A message task, unlike a timer, isn't throttled in
// background tabs.
function nextTask() {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(undefined);
  });
}

// Focuses an element and selects its text so trusted input replaces it.
export function prepareTrustedInput(ref: string, clear: boolean) {
  const element = resolveRef(ref);
  reveal(element);
  const host = editingHost(element) || (element as HTMLElement);
  host.focus({ preventScroll: true });
  selectContents(host, clear);
}

// Where trusted (debugger) input should land for an element, in viewport
// coordinates, after scrolling it into view and optionally focusing it.
export function inputPoint(ref: string, focus: boolean) {
  const element = resolveRef(ref);
  reveal(element);
  if (focus && element instanceof HTMLElement)
    element.focus({ preventScroll: true });
  return centerOf(element);
}

export function editableText(ref: string) {
  const element = resolveRef(ref);
  const host = editingHost(element) || element;
  return compact((host as HTMLElement).innerText);
}

const KEY_CODES: Record<string, string> = {
  Enter: "Enter",
  Escape: "Escape",
  Tab: "Tab",
  " ": "Space",
  Backspace: "Backspace",
  ArrowDown: "ArrowDown",
  ArrowUp: "ArrowUp",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
};

function press(element: Element, combo: string): StepResult {
  const parts = combo.split("+");
  const key = parts.pop() || "Enter";
  const mods = new Set(parts.map((part) => part.toLowerCase()));
  const init = {
    key: key === "Space" ? " " : key,
    code:
      KEY_CODES[key] || (key.length === 1 ? `Key${key.toUpperCase()}` : key),
    bubbles: true,
    cancelable: true,
    composed: true,
    ctrlKey: mods.has("control") || mods.has("ctrl"),
    shiftKey: mods.has("shift"),
    altKey: mods.has("alt"),
    metaKey: mods.has("meta") || mods.has("cmd"),
  };
  if (element instanceof HTMLElement) element.focus({ preventScroll: true });
  const down = new KeyboardEvent("keydown", init);
  element.dispatchEvent(down);
  if (init.key.length === 1 || init.key === "Enter")
    element.dispatchEvent(new KeyboardEvent("keypress", init));
  element.dispatchEvent(
    new KeyboardEvent("keyup", { ...init, cancelable: false }),
  );
  if (down.defaultPrevented) return ok();
  // Default actions synthetic events do not trigger.
  const modifier = init.ctrlKey || init.metaKey;
  if (
    modifier &&
    key.toLowerCase() === "a" &&
    (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement)
  )
    element.select();
  else if (
    init.key === "Enter" &&
    element instanceof HTMLInputElement &&
    element.form
  )
    element.form.requestSubmit();
  else if (
    (init.key === "Enter" || init.key === " ") &&
    (element instanceof HTMLButtonElement ||
      element instanceof HTMLAnchorElement ||
      element.localName === "summary")
  )
    (element as HTMLElement).click();
  else if (
    init.key === " " &&
    element instanceof HTMLInputElement &&
    ["checkbox", "radio"].includes(element.type)
  )
    element.click();
  return ok();
}

function select(element: Element, wanted: string): StepResult {
  if (!(element instanceof HTMLSelectElement))
    return failed(
      `${describe(element)} is not a native select. Click it to open it, then click the option (find gives its ref).`,
    );
  const target = compact(wanted).toLowerCase();
  const options = Array.from(element.options);
  const option =
    options.find((item) => item.value === wanted) ||
    options.find((item) => compact(item.text).toLowerCase() === target) ||
    options.find((item) => compact(item.text).toLowerCase().includes(target));
  if (!option)
    return failed(
      `No option matching "${wanted}" in ${describe(element)}. Use find with part of the option text to see the options.`,
    );
  reveal(element);
  element.focus({ preventScroll: true });
  setNativeValue(element, option.value);
  return ok(`selected "${compact(option.text)}"`);
}

function scroll(element: Element | undefined, requested?: string): StepResult {
  const by = (sign: number) => sign * Math.round(innerHeight * 0.8);
  if (element && !requested) {
    reveal(element);
    return ok();
  }
  const direction = requested || "down";
  const target: Element | Window = element || window;
  if (direction === "top") target.scrollTo({ top: 0, behavior: "instant" });
  else if (direction === "bottom")
    target.scrollTo({
      top: element
        ? element.scrollHeight
        : document.documentElement.scrollHeight,
      behavior: "instant",
    });
  else if (direction === "up")
    target.scrollBy({ top: by(-1), behavior: "instant" });
  else if (direction === "down")
    target.scrollBy({ top: by(1), behavior: "instant" });
  else if (element) reveal(element);
  else
    return failed(
      `Unknown scroll direction "${direction}". Use up, down, top or bottom.`,
    );
  return ok(
    `scrollY=${Math.round(scrollY)} of ${document.documentElement.scrollHeight}`,
  );
}

function drag(source: Element, target: Element): StepResult {
  reveal(source);
  const from = mouseInit(source);
  const to = mouseInit(target);
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
  return ok();
}

export function hasText(text: string) {
  return (document.body?.innerText || "")
    .toLowerCase()
    .includes(text.toLowerCase());
}

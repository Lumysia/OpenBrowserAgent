import { editingHost } from "../shared/dom-vocabulary";
import { isOwnUiEvent } from "../shared/page-ui";
import { isSecretField } from "../shared/teach/secret-fields";
import {
  TEACH_STEP_KIND,
  type TeachEvent,
  type TeachStepKind,
} from "../shared/teach/types";
import { urlPattern } from "../shared/teach/urls";
import {
  clickedElement,
  describeElement,
  fieldSignals,
  inputTypeOf,
  isFormField,
} from "./describe";

// Listens to what the user does on the page, in the capture phase so the
// page cannot hide it, and reports steps: trusted clicks, changes of
// selects, checkboxes and radios, fields once committed (blur, change or
// Enter), and shortcut keys. A field's value never leaves this script: a
// step says which field, its type and the entry's length; the value stays
// here (for this document only) in case the user keeps it as an example,
// which the background asks for by step and only for fields that are not
// secret.

// Ctrl/Cmd + these keys in a field edit text; they are not steps.
const EDITING_KEYS = new Set(["a", "c", "v", "x", "z", "y"]);
const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift", "AltGraph"]);

export type Capture = {
  stop(): void;
  // The value of a field step, while this page still has it.
  exampleOf(stepId: string): string | undefined;
};

export function startCapture(report: (event: TeachEvent) => void): Capture {
  // Fields typed in and not committed yet.
  const dirty = new Set<Element>();
  // Fields that were password fields at some point.
  const passwords = new WeakSet<Element>();
  // Values of committed fields that are not secret, by step.
  const values = new Map<string, string>();

  const page = () => ({
    title: document.title.trim(),
    url: urlPattern(location.href),
  });

  const step = (kind: TeachStepKind, element?: Element) => ({
    id: crypto.randomUUID(),
    kind,
    at: Date.now(),
    page: page(),
    ...(element ? { target: describeElement(element) } : {}),
  });

  const notePassword = (element: Element | null) => {
    if (element instanceof HTMLInputElement && element.type === "password")
      passwords.add(element);
  };

  const fieldOf = (event: Event) => {
    const element = event.composedPath()[0];
    if (!(element instanceof Element)) return undefined;
    const host = editingHost(element);
    const field = host || element;
    return isFormField(field) ? field : undefined;
  };

  function commit(field: Element, submitted: boolean) {
    if (!dirty.delete(field)) return;
    const base = step(TEACH_STEP_KIND.field, field);
    const value =
      "value" in field
        ? String((field as HTMLInputElement).value)
        : (field as HTMLElement).innerText || "";
    const secret = isSecretField(
      fieldSignals(field, base.target!, passwords.has(field)),
    );
    if (!secret) values.set(base.id, value);
    const length =
      field instanceof HTMLInputElement && field.type === "file"
        ? field.files?.length || 0
        : value.length;
    report({
      ...base,
      field: {
        inputType: inputTypeOf(field),
        length,
        secret,
        ...(submitted ? { submitted } : {}),
      },
    });
  }

  function onInput(event: Event) {
    if (!event.isTrusted || isOwnUiEvent(event)) return;
    const field = fieldOf(event);
    if (!field) return;
    notePassword(field);
    if (field instanceof HTMLSelectElement) return;
    if (
      field instanceof HTMLInputElement &&
      (field.type === "checkbox" || field.type === "radio")
    )
      return;
    dirty.add(field);
  }

  function onChange(event: Event) {
    if (!event.isTrusted || isOwnUiEvent(event)) return;
    const field = fieldOf(event);
    if (!field) return;
    if (field instanceof HTMLSelectElement) {
      const base = step(TEACH_STEP_KIND.choose, field);
      const secret = isSecretField(fieldSignals(field, base.target!, false));
      const choice = Array.from(field.selectedOptions)
        .map((option) => option.label.trim())
        .join(", ");
      report({
        ...base,
        ...(secret
          ? {
              field: {
                inputType: "select",
                length: choice.length,
                secret: true,
              },
            }
          : { choice }),
      });
      return;
    }
    if (
      field instanceof HTMLInputElement &&
      (field.type === "checkbox" || field.type === "radio")
    ) {
      report({
        ...step(TEACH_STEP_KIND.toggle, field),
        checked: field.checked,
      });
      return;
    }
    commit(field, false);
  }

  function onFocusOut(event: FocusEvent) {
    const field = fieldOf(event);
    if (field && dirty.has(field)) commit(field, false);
  }

  function onFocusIn(event: FocusEvent) {
    const field = fieldOf(event);
    if (field) notePassword(field);
  }

  function onClick(event: MouseEvent) {
    if (!event.isTrusted || isOwnUiEvent(event)) return;
    const element = clickedElement(event.composedPath());
    if (element) report(step(TEACH_STEP_KIND.click, element));
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!event.isTrusted || isOwnUiEvent(event) || event.isComposing) return;
    if (MODIFIER_KEYS.has(event.key)) return;
    const field = fieldOf(event);
    if (event.key === "Enter" && field instanceof HTMLInputElement) {
      if (dirty.has(field)) commit(field, true);
      else report({ ...step(TEACH_STEP_KIND.key, field), key: event.key });
      return;
    }
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    if (!modified && event.key !== "Escape") return;
    if (
      field &&
      (event.ctrlKey || event.metaKey) &&
      EDITING_KEYS.has(event.key.toLowerCase())
    )
      return;
    const key = [
      event.ctrlKey && "Control",
      event.metaKey && "Meta",
      event.altKey && "Alt",
      event.shiftKey && "Shift",
      event.key.length === 1 ? event.key.toUpperCase() : event.key,
    ]
      .filter(Boolean)
      .join("+");
    report({ ...step(TEACH_STEP_KIND.key), key });
  }

  // A show-password toggle turns a password field into a text field: it
  // stays secret.
  const types = new MutationObserver((records) => {
    for (const record of records)
      if (record.oldValue === "password" && record.target instanceof Element)
        passwords.add(record.target);
  });
  types.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ["type"],
    attributeOldValue: true,
  });
  document
    .querySelectorAll('input[type="password"]')
    .forEach((element) => passwords.add(element));

  const listeners: [string, EventListener][] = [
    ["input", onInput],
    ["change", onChange],
    ["focusout", onFocusOut as EventListener],
    ["focusin", onFocusIn as EventListener],
    ["click", onClick as EventListener],
    ["keydown", onKeyDown as EventListener],
  ];
  for (const [type, listener] of listeners)
    addEventListener(type, listener, true);

  return {
    stop() {
      for (const [type, listener] of listeners)
        removeEventListener(type, listener, true);
      types.disconnect();
      dirty.clear();
      values.clear();
    },
    exampleOf: (stepId) => values.get(stepId),
  };
}

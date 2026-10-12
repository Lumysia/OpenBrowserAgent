import {
  restoreSelection,
  selectionIntact,
  type SelectionSnapshot,
} from "./selection";

export type WriteMode = "replace" | "insertBelow";

// Writes into the field the snapshot came from as if the user typed it:
// `insertText` keeps the browser's undo (Ctrl+Z) and fires the input events
// that framework-controlled fields and rich editors listen to. False, with
// nothing written, when the selected text is no longer where it was.
export function writeIntoSelection(
  snapshot: SelectionSnapshot,
  text: string,
  mode: WriteMode,
) {
  const { target } = snapshot;
  if (target.kind === "page" || !selectionIntact(snapshot)) return false;
  restoreSelection(snapshot);
  if (target.kind === "control") {
    const { element } = target;
    const insert = mode === "insertBelow" ? `\n${text}` : text;
    if (mode === "insertBelow")
      element.setSelectionRange(target.end, target.end);
    if (document.execCommand("insertText", false, insert)) return true;
    // Browsers without insertText in fields: same change, no undo entry.
    const start = mode === "insertBelow" ? target.end : target.start;
    element.setRangeText(insert, start, target.end, "end");
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: insert,
      }),
    );
    return true;
  }
  if (mode === "insertBelow") {
    getSelection()?.collapseToEnd();
    document.execCommand("insertParagraph");
  }
  if (document.execCommand("insertText", false, text)) return true;
  const range = getSelection()?.getRangeAt(0);
  if (!range) return false;
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  target.element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    }),
  );
  return true;
}

// Clipboard API where the page allows it (secure context, user gesture),
// else the legacy copy command on a scratch field.
export async function copyText(text: string, scratchParent: Node) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    scratchParent.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  }
}

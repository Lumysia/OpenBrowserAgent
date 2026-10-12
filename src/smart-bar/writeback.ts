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
// else the legacy copy command. The page decides which one runs (http, its
// permissions policy), so the fallback must not show it the text either.
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyThroughEvent(text);
  }
}

// The copy command with nothing selected: the text goes into the copy event
// in this world's window listener, which stops the event before the page's
// later listeners. Listeners the page added earlier still see the event,
// but not the text, which is set after them. False when the page stopped it.
function copyThroughEvent(text: string) {
  let copied = false;
  const write = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    event.stopImmediatePropagation();
    copied = true;
  };
  addEventListener("copy", write, { capture: true, once: true });
  try {
    document.execCommand("copy");
  } finally {
    removeEventListener("copy", write, { capture: true });
  }
  return copied;
}

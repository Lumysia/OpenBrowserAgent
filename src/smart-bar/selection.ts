// Reads what the user selected, at the moment the bar opens. Actions use this
// snapshot rather than the live selection, which clicks and focus can change.
import { editingHost } from "../shared/dom-vocabulary";

export type TextControl = HTMLInputElement | HTMLTextAreaElement;

export type SelectionTarget =
  | { kind: "page"; range: Range }
  | {
      kind: "control";
      element: TextControl;
      start: number;
      end: number;
      // The whole field, to tell whether anything was edited since.
      value: string;
    }
  | {
      kind: "editable";
      element: HTMLElement;
      range: Range;
      // The range's own text, which can differ from the selection's (line
      // breaks between blocks).
      rangeText: string;
    };

export type Point = { x: number; y: number };

// Text around the selection, so an action can tell what a cut-off word or a
// short phrase means. Read when an action runs, and sent only with it.
export type SelectionContext = {
  before: string;
  after: string;
  pageTitle?: string;
};

export type SelectionSnapshot = {
  text: string;
  target: SelectionTarget;
  // Where the mouse was released, relative to selectionRect() at that time
  // so it moves with the page; undefined for the keyboard shortcut.
  pointOffset?: Point;
};

export type Rect = { left: number; top: number; right: number; bottom: number };

// Input types with a selection API; password fields are never read.
const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel"]);

const INTERACTIVE =
  "button, [role=button], a[href], select, summary, label, video, audio";

export function isEditableSnapshot(snapshot: SelectionSnapshot) {
  return snapshot.target.kind !== "page";
}

// `target` is the element the mouse was released on, if any.
export function readSelection(
  target: EventTarget | null,
  point: Point | undefined,
): SelectionSnapshot | undefined {
  const active = deepActiveElement();
  if (active instanceof HTMLInputElement && active.type === "password")
    return undefined;
  if (isTextControl(active)) {
    if (target instanceof Node && !active.contains(target)) return undefined;
    const { selectionStart: start, selectionEnd: end } = active;
    if (start === null || end === null || start === end) return undefined;
    const { value } = active;
    const text = value.slice(start, end);
    if (!text.trim()) return undefined;
    return withPoint(
      {
        text,
        target: { kind: "control", element: active, start, end, value },
      },
      point,
    );
  }
  const selection = getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return undefined;
  const text = selection.toString();
  if (!text.trim()) return undefined;
  const range = selection.getRangeAt(0).cloneRange();
  // A click on a button or link with an old selection elsewhere.
  if (
    target instanceof Element &&
    target.closest(INTERACTIVE) &&
    !range.intersectsNode(target)
  )
    return undefined;
  const host = editingHost(range.commonAncestorContainer);
  return withPoint(
    {
      text,
      target: host
        ? {
            kind: "editable",
            element: host,
            range,
            rangeText: range.toString(),
          }
        : { kind: "page", range },
    },
    point,
  );
}

// Characters of context on each side of the selection.
const CONTEXT_CHARS = 500;
// Characters of the page's title sent along.
const PAGE_TITLE_MAX_CHARS = 200;

// Text the user can't see on the page. A textarea's text node is its default
// value, not what it holds now.
const NOT_TEXT =
  "script, style, noscript, template, textarea, [hidden], [aria-hidden='true']";

export function selectionContext({
  target,
}: SelectionSnapshot): SelectionContext {
  if (target.kind === "control") {
    const { value, start, end } = target;
    return pageContext(
      value.slice(Math.max(0, start - CONTEXT_CHARS), start),
      value.slice(end, end + CONTEXT_CHARS),
    );
  }
  const { range } = target;
  return pageContext(
    textBeside(range.startContainer, range.startOffset, true),
    textBeside(range.endContainer, range.endOffset, false),
  );
}

// Up to CONTEXT_CHARS of the page's text before (or after) a point, walking
// text nodes outward from it.
function textBeside(node: Node, offset: number, before: boolean) {
  const root = document.body || document.documentElement;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (text) =>
      text.parentElement?.closest(NOT_TEXT)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const parts: string[] = [];
  let length = 0;
  const add = (text: string) => {
    parts.push(text);
    length += text.length;
  };
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    add(before ? text.slice(0, offset) : text.slice(offset));
    walker.currentNode = node;
  } else {
    // A point between children: start from the child next to it.
    const child = node.childNodes[before ? offset - 1 : offset];
    if (child) {
      walker.currentNode = child;
      if (before) {
        // The last text inside that child comes first.
        let last: Node | null = child;
        while (last?.lastChild) last = last.lastChild;
        walker.currentNode = last || child;
        if (walker.currentNode.nodeType === Node.TEXT_NODE)
          add(walker.currentNode.textContent || "");
      } else {
        walker.currentNode = child;
        if (child.nodeType === Node.TEXT_NODE) add(child.textContent || "");
      }
    } else walker.currentNode = node;
  }
  while (length < CONTEXT_CHARS) {
    const next = before ? walker.previousNode() : walker.nextNode();
    if (!next) break;
    if (next.nodeType === Node.TEXT_NODE) add(next.textContent || "");
  }
  const text = (before ? parts.reverse() : parts).join("");
  return before ? text.slice(-CONTEXT_CHARS) : text.slice(0, CONTEXT_CHARS);
}

// Runs of spaces are squeezed but kept at the edges: whether the selection
// starts or ends inside a word is the point.
function pageContext(before: string, after: string): SelectionContext {
  const squeeze = (text: string) => text.replace(/\s+/g, " ");
  return {
    before: squeeze(before),
    after: squeeze(after),
    pageTitle:
      document.title.trim().slice(0, PAGE_TITLE_MAX_CHARS) || undefined,
  };
}

// The page's language for the selected text (its nearest lang attribute).
// Often missing or wrong: reading aloud takes it as a hint only.
export function selectionLanguage({ target }: SelectionSnapshot) {
  const node =
    target.kind === "control" ? target.element : target.range.startContainer;
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest("[lang]")?.getAttribute("lang") || undefined;
}

function withPoint(snapshot: SelectionSnapshot, point: Point | undefined) {
  const rect = point && selectionRect(snapshot);
  return rect
    ? {
        ...snapshot,
        pointOffset: { x: point.x - rect.left, y: point.y - rect.top },
      }
    : snapshot;
}

// The selected text's box, or the field's for text controls.
export function selectionRect(snapshot: SelectionSnapshot): Rect | undefined {
  const { target } = snapshot;
  if (target.kind === "control") {
    if (!target.element.isConnected) return undefined;
    return target.element.getBoundingClientRect();
  }
  const rect = target.range.getBoundingClientRect();
  if (rect.width || rect.height) return rect;
  // Collapsed or detached ranges measure as 0x0 at the origin.
  const container = target.range.commonAncestorContainer;
  const element =
    container instanceof Element ? container : container.parentElement;
  return element?.isConnected ? element.getBoundingClientRect() : undefined;
}

// Whether the field still holds the snapshot's text where it was selected.
// The user can keep typing while a result shows; writing at the old place
// would then overwrite their text. Text fields must be unchanged as a whole:
// the old offsets can hold the same text again after an edit before them.
// A contenteditable's live range moves with such edits.
export function selectionIntact(snapshot: SelectionSnapshot) {
  const { target } = snapshot;
  if (target.kind === "page") return false;
  if (!target.element.isConnected) return false;
  if (target.kind === "control") return target.element.value === target.value;
  return target.range.toString() === target.rangeText;
}

// Makes the snapshot the live selection again (focus included), e.g. before
// writing into it.
export function restoreSelection(snapshot: SelectionSnapshot) {
  const { target } = snapshot;
  if (target.kind === "control") {
    target.element.focus({ preventScroll: true });
    target.element.setSelectionRange(target.start, target.end);
    return;
  }
  if (target.kind === "editable") target.element.focus({ preventScroll: true });
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(target.range);
}

// The frame's focused element, inside open shadow roots too.
function deepActiveElement() {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement)
    active = active.shadowRoot.activeElement;
  return active;
}

function isTextControl(element: Element | null): element is TextControl {
  if (element instanceof HTMLTextAreaElement) return true;
  return (
    element instanceof HTMLInputElement &&
    TEXT_INPUT_TYPES.has(element.type || "text")
  );
}

// DOM reading helpers for the in-page agent: visibility, ARIA-style roles,
// accessible names and the inline/block structure the snapshot follows.
import {
  BLOCK_SELECTOR,
  BLOCK_TAGS,
  editingHost,
  hasTag,
  HEADING_TAGS,
  NON_RENDERED_TAGS,
  SECTIONING_SELECTOR,
} from "../shared/dom-vocabulary";
import { compact } from "../shared/text";

const IMPLICIT_ROLE: Record<string, string> = {
  button: "button",
  select: "combobox",
  textarea: "textbox",
  ...Object.fromEntries([...HEADING_TAGS].map((tag) => [tag, "heading"])),
  nav: "navigation",
  main: "main",
  aside: "complementary",
  form: "form",
  dialog: "dialog",
  ul: "list",
  ol: "list",
  menu: "list",
  li: "listitem",
  table: "table",
  tr: "row",
  th: "columnheader",
  td: "cell",
  p: "paragraph",
  blockquote: "blockquote",
  pre: "code",
  fieldset: "group",
  details: "group",
  summary: "button",
  img: "img",
  figure: "figure",
  figcaption: "caption",
  caption: "caption",
  label: "label",
  dt: "term",
  dd: "definition",
  hr: "separator",
  iframe: "iframe",
  video: "video",
  audio: "audio",
  progress: "progressbar",
  meter: "meter",
  option: "option",
};

const INPUT_ROLE: Record<string, string> = {
  button: "button",
  submit: "button",
  reset: "button",
  image: "button",
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  number: "spinbutton",
  search: "searchbox",
  file: "button",
  color: "button",
};

const INTERACTIVE_ROLES = new Set([
  "link",
  "button",
  "textbox",
  "searchbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
  "option",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "tab",
  "treeitem",
  "listbox",
  "clickable",
]);

// Containers that get their own line and indent their children.
export const CONTAINER_ROLES = new Set([
  "navigation",
  "main",
  "banner",
  "contentinfo",
  "complementary",
  "region",
  "search",
  "form",
  "dialog",
  "alertdialog",
  "list",
  "table",
  "grid",
  "group",
  "tablist",
  "menu",
  "menubar",
  "listbox",
  "tree",
  "figure",
  "radiogroup",
]);

// Elements that may be controls; roleOf and isInteractive decide.
export const CONTROL_CANDIDATES =
  "a[href],button,input,select,textarea,summary,[role],[contenteditable],[tabindex],[onclick]";

export function clip(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function isSkipped(element: Element) {
  return hasTag(element, NON_RENDERED_TAGS);
}

// A parsed document that is not rendered (DOMParser) has no layout and no
// computed styles: visibility and block structure come from markup alone.
function isRendered(element: Element) {
  return !!element.ownerDocument.defaultView;
}

export function isHidden(element: Element) {
  if (isSkipped(element)) return true;
  if (element.getAttribute("aria-hidden") === "true") return true;
  if (element instanceof HTMLElement && element.hidden) return true;
  if (element instanceof HTMLInputElement && element.type === "hidden")
    return true;
  if (!isRendered(element)) {
    const style = (element as HTMLElement).style;
    return style?.display === "none" || style?.visibility === "hidden";
  }
  const check = (
    element as Element & {
      checkVisibility?: (options: object) => boolean;
    }
  ).checkVisibility;
  if (!check) {
    const style = getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden";
  }
  if (
    check.call(element, {
      visibilityProperty: true,
      contentVisibilityAuto: false,
    })
  )
    return false;
  // Elements without a box of their own (slots, display: contents) show
  // their children.
  return getComputedStyle(element).display !== "contents";
}

export function roleOf(element: Element): string {
  const explicit = element.getAttribute("role")?.split(/\s+/)[0];
  if (explicit && explicit !== "presentation" && explicit !== "none")
    return explicit;
  const tag = element.localName;
  if (tag === "a") return element.hasAttribute("href") ? "link" : "";
  if (tag === "input") {
    const type = (element as HTMLInputElement).type;
    return INPUT_ROLE[type] || "textbox";
  }
  if (tag === "header")
    return element.closest(SECTIONING_SELECTOR) ? "" : "banner";
  if (tag === "footer")
    return element.closest(SECTIONING_SELECTOR) ? "" : "contentinfo";
  if (tag === "section")
    return element.hasAttribute("aria-label") ||
      element.hasAttribute("aria-labelledby")
      ? "region"
      : "";
  if (tag === "svg")
    return element.hasAttribute("aria-label") ||
      element.querySelector(":scope > title")
      ? "img"
      : "";
  if (IMPLICIT_ROLE[tag]) return IMPLICIT_ROLE[tag];
  if (editingHost(element) === element) return "textbox";
  if (isClickable(element)) return "clickable";
  return "";
}

function isClickable(element: Element) {
  if (element.hasAttribute("onclick")) return true;
  const tabindex = element.getAttribute("tabindex");
  return tabindex !== null && Number(tabindex) >= 0;
}

export function isInteractive(element: Element, role = roleOf(element)) {
  return INTERACTIVE_ROLES.has(role);
}

export function headingLevel(element: Element) {
  const level =
    Number(element.getAttribute("aria-level")) ||
    Number(element.localName.match(/^h([1-6])$/)?.[1]);
  return level || 2;
}

function textById(ids: string) {
  return compact(
    ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" "),
  );
}

// Label text without the text of controls inside the label (a select's
// options would otherwise become part of its name).
function labelText(element: Element) {
  const control = element as HTMLInputElement;
  const labels = control.labels ? Array.from(control.labels) : [];
  const text = (node: Node): string =>
    node.nodeType === Node.TEXT_NODE
      ? node.textContent || ""
      : node instanceof Element &&
          !["input", "select", "textarea", "button"].includes(node.localName)
        ? Array.from(node.childNodes).map(text).join(" ")
        : "";
  return compact(labels.map(text).join(" "));
}

// Accessible name, simplified: ARIA naming, labels, alt/title/placeholder,
// then visible text for roles named by their content.
export function nameOf(element: Element, role = roleOf(element)): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  const name =
    compact(element.getAttribute("aria-label")) ||
    (labelledBy ? textById(labelledBy) : "") ||
    labelText(element) ||
    compact(element.getAttribute("alt")) ||
    compact(element.querySelector(":scope > title")?.textContent);
  if (name) return name;
  if (
    element instanceof HTMLInputElement &&
    ["button", "submit", "reset"].includes(element.type)
  )
    return compact(element.value);
  if (
    [
      "link",
      "button",
      "tab",
      "menuitem",
      "option",
      "treeitem",
      "clickable",
      "menuitemcheckbox",
      "menuitemradio",
      "heading",
      "caption",
      "label",
    ].includes(role)
  ) {
    const text = compact((element as HTMLElement).innerText);
    if (text) return text;
  }
  return (
    compact(element.getAttribute("title")) ||
    compact(element.getAttribute("placeholder")) ||
    compact(element.getAttribute("aria-placeholder"))
  );
}

const BLOCK_DISPLAYS = new Set([
  "block",
  "flex",
  "grid",
  "list-item",
  "table",
  "table-row",
  "table-cell",
  "table-row-group",
  "table-header-group",
  "table-footer-group",
  "flow-root",
]);

export function isBlock(element: Element) {
  // Unrendered documents have no styles: the default style sheet's blocks.
  // Custom elements usually wrap blocks with a display set by script or
  // style sheet; without either, holding a block makes them one.
  if (!isRendered(element))
    return (
      hasTag(element, BLOCK_TAGS) ||
      (element.localName.includes("-") &&
        !!element.querySelector(BLOCK_SELECTOR))
    );
  return BLOCK_DISPLAYS.has(getComputedStyle(element).display);
}

export function children(node: Element | ShadowRoot) {
  const host = node as Element;
  if (host.shadowRoot) return Array.from(host.shadowRoot.childNodes);
  if (host.localName === "slot")
    return (host as HTMLSlotElement).assignedNodes({ flatten: true });
  return Array.from(node.childNodes);
}

export function inViewport(element: Element, margin = 0) {
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return true;
  return rect.bottom >= -margin && rect.top <= innerHeight + margin;
}

export function centerOf(element: Element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

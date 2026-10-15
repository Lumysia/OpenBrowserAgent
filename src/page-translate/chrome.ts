// The page's own interface: its controls and the regions that hold them.
// Decided by tag, role and attribute, and by whether a label reads as
// content (see shared/text.ts readsAsSentence).
import { HEADING_SELECTOR, hasTag } from "../shared/dom-vocabulary";
import { compact, readsAsSentence } from "../shared/text";
import { isDecorative, isOwn, isTextTag } from "./dom-rules";
import { originalText } from "./originals";

// Headings and paragraphs keep a translation on its own line however short,
// and so does a control whose label is content: a title (see
// isContentControl).
export function isTextBlock(element: Element) {
  return isTextTag(element) || isContentControl(element);
}

// The page's own chrome: its controls (buttons, tabs, menu items, options)
// and the regions that hold its interface (navigation, menus, toolbars,
// search, dialogs, and the page's header, footer and sidebars outside the
// article: an article's own header holds its title). Short labels there are
// left as they are unless the user also translates menus and buttons; text
// that reads as content is translated anyway (see Paragraph's `content` in
// blocks.ts). Boxes laid over the article are found by their style (see
// layout.ts).
const CHROME_TAGS: ReadonlySet<string> = new Set([
  "nav",
  "menu",
  "button",
  "search",
  "summary",
  "dialog",
]);
// Roles of controls: their labels are part of the page's interface.
const CONTROL_ROLES = new Set([
  "button",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "switch",
  "checkbox",
  "radio",
]);
const CHROME_ROLES = new Set([
  ...CONTROL_ROLES,
  "navigation",
  "banner",
  "contentinfo",
  "menu",
  "menubar",
  "listbox",
  "tablist",
  "toolbar",
  "search",
  "dialog",
  "alertdialog",
]);
export const CONTROL_SELECTOR = [
  "button",
  "summary",
  ...[...CONTROL_ROLES].map((role) => `[role=${role}]`),
].join(",");
// Lists of links that work as controls: menus, tab bars, toolbars.
const CONTROL_LIST_SELECTOR =
  "nav, menu, [role=navigation], [role=menu], [role=menubar], [role=tablist], [role=toolbar], [role=listbox]";
const LINK_SELECTOR = "a[href]";

// A link in a menu, tab bar or toolbar.
export function isListLink(element: Element) {
  return (
    element.matches(LINK_SELECTOR) &&
    !!element.parentElement?.closest(CONTROL_LIST_SELECTOR)
  );
}

// The control the element labels: a button, a tab, a menu item, or a link
// in a menu, tab bar or toolbar. Controls whose label is content (see
// isContentControl) are text, not controls.
export function controlOf(element: Element) {
  let control = element.closest(CONTROL_SELECTOR);
  while (control && isContentControl(control))
    control = control.parentElement?.closest(CONTROL_SELECTOR) ?? null;
  if (control) return control;
  const link = element.closest(LINK_SELECTOR);
  return link && isListLink(link) && !isContentControl(link) ? link : null;
}

// The control around the element whose label is content, if any.
export function contentControlOf(element: Element) {
  const control = element.closest(`${CONTROL_SELECTOR}, ${LINK_SELECTOR}`);
  return control && isContentControl(control) ? control : null;
}

// Controls whose label is the page's content rather than its interface,
// translated like headings even while menus and buttons aren't: a label
// that reads as a sentence or asks a question ("How many saves can I
// upload?", a quiz answer, a question in a tab list), the title of a section
// that opens and closes (see isDisclosureTitle), and a link in navigation
// that names a heading of the page (a table of contents). Short labels
// ("Log in", "Read more", "Home") are interface, and so is a control that
// opens a menu, a list or a dialog.
const TITLE_CONTROL_SELECTOR = "button, summary, [role=button]";

export function isContentControl(control: Element) {
  const link = isListLink(control);
  if (!link && !control.matches(CONTROL_SELECTOR)) return false;
  const popup = control.getAttribute("aria-haspopup");
  if (popup !== null && popup !== "false") return false;
  if (control.matches(TITLE_CONTROL_SELECTOR) && isDisclosureTitle(control))
    return true;
  const text = labelOf(control);
  return readsAsSentence(text) || (link && isHeadingEntry(control, text));
}

// The texts of the page's headings outside menus and navigation, kept for
// the current task only: the page can't change them before it ends.
let headings: { document: Document; texts: Set<string> } | undefined;
const core = (text: string) =>
  text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

// Whether the link's text is that of a heading of the page: an entry of a
// table of contents.
function isHeadingEntry(link: Element, text: string) {
  const document = link.ownerDocument;
  if (headings?.document !== document) {
    const texts = new Set<string>();
    for (const heading of document.querySelectorAll(HEADING_SELECTOR))
      if (!heading.closest(CONTROL_LIST_SELECTOR))
        texts.add(core(labelOf(heading)));
    headings = { document, texts };
    queueMicrotask(() => (headings = undefined));
  }
  const entry = core(text);
  return !!entry && headings.texts.has(entry);
}

// How far up the title's own box is looked for: the control, the heading
// around it, and the element around that.
const TITLE_DEPTH = 3;

// A section's title that opens and closes it: a `summary`; a control that
// is all of a heading's text (the ARIA accordion: a button in a heading);
// or a control marked as expanding (`aria-expanded`) whose section follows
// it: the element it says it controls (`aria-controls`), or else the one
// right after it, comes right after the control's own box. A toggle under
// the text it expands ("Show more") and one opening navigation are
// interface.
function isDisclosureTitle(control: Element) {
  if (control.localName === "summary") return true;
  const text = labelOf(control);
  if (!text) return false;
  const heading = control.parentElement?.closest(HEADING_SELECTOR);
  if (heading && labelOf(heading) === text) return true;
  if (!control.hasAttribute("aria-expanded")) return false;
  let box = control;
  for (
    let depth = 1;
    depth < TITLE_DEPTH &&
    box.parentElement &&
    labelOf(box.parentElement) === text;
    depth++
  )
    box = box.parentElement;
  const ids = control.getAttribute("aria-controls")?.trim().split(/\s+/);
  const section = ids?.[0]
    ? control.ownerDocument.getElementById(ids[0])
    : box.nextElementSibling;
  if (!section || box.nextElementSibling !== section) return false;
  return (
    !isInterface(section) &&
    !section.querySelector(CONTROL_LIST_SELECTOR) &&
    !section.matches(CONTROL_LIST_SELECTOR)
  );
}

// The element's text as the page wrote it, without our translations and
// icons, white space collapsed.
export function labelOf(element: Element) {
  let text = "";
  for (const child of element.childNodes)
    if (child.nodeType === 3) text += originalText(child as Text);
    else if (
      child.nodeType === 1 &&
      !isOwn(child) &&
      !isDecorative(child as Element)
    )
      text += labelOf(child as Element);
  return compact(text);
}

// Controls that pick a place or a view: menu items, tabs, options, and
// links in a menu, tab bar or toolbar (see controlOf).
const MENU_ITEM_ROLES = new Set([
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
]);

export function isMenuItem(control: Element) {
  return (
    MENU_ITEM_ROLES.has(control.getAttribute("role") ?? "") ||
    isListLink(control)
  );
}

const PAGE_EDGE_TAGS: ReadonlySet<string> = new Set([
  "header",
  "footer",
  "aside",
]);
export const ARTICLE_SELECTOR = "main, article, [role=main], [role=article]";

// Navigation, menus, controls and dialogs by their tag or role.
function isInterface(element: Element) {
  const role = element.getAttribute("role");
  return hasTag(element, CHROME_TAGS) || (!!role && CHROME_ROLES.has(role));
}

// A control whose label is the page's interface (see isContentControl).
export function isControl(element: Element) {
  return element.matches(CONTROL_SELECTOR) && !isContentControl(element);
}

// A region of the page's interface: what is in it is translated only where
// it reads as content (see Paragraph's `content` in blocks.ts).
export function isRegion(element: Element) {
  if (element.matches(CONTROL_SELECTOR)) return false;
  if (isInterface(element)) return true;
  if (element.getAttribute("aria-modal") === "true") return true;
  const role = element.getAttribute("role");
  return (
    (hasTag(element, PAGE_EDGE_TAGS) || role === "complementary") &&
    !element.parentElement?.closest(ARTICLE_SELECTOR)
  );
}

export function isChrome(element: Element) {
  return isControl(element) || isRegion(element);
}

// Whether the element or one around it is chrome (see isChrome); shadow
// roots count as part of their host.
export function isInsideChrome(element: Element) {
  for (let current: Element | null = element; current;) {
    if (isChrome(current)) return true;
    current =
      current.parentElement ??
      ((current.parentNode as ShadowRoot | null)?.host || null);
  }
  return false;
}

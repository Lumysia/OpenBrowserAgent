// Which page elements are translated, and how. Decided by tag, role and
// attribute; the page's styles are read only for the few candidates markup
// can't decide (see styles.ts): reading them on every element stalls large
// pages.
import {
  BLOCK_SELECTOR,
  CODE_TAGS,
  FIELD_PART_TAGS,
  FORM_FIELD_TAGS,
  hasTag,
  HEADING_SELECTOR,
  HEADING_TAGS,
  MEDIA_TAGS,
  PAGE_METADATA_TAGS,
  SCRIPTING_TAGS,
  VALUE_TAGS,
} from "../shared/dom-vocabulary";
import { compact, isQuestion, wordCount } from "../shared/text";
import { originalText } from "./originals";
import { isLigatureIcon } from "./styles";

// The attribute on our own elements: translations and the style sheet.
export const TRANSLATION_ATTRIBUTE = "data-oba-translation";
export const TRANSLATION_TAG = "oba-translation";

// What each tag is to translation, by tag group (see dom-vocabulary.ts):
// `atom`: never translated nor looked into, kept as it is inside the
// sentence around it; `inline`: part of the paragraph around it;
// `uncopied`: left out of the translation (a copy of a form field or of
// media would be a second, dead one); `decorative`: decorates the text
// without being part of it, so it is neither sent nor shown again.
type Trait = "atom" | "inline" | "uncopied" | "decorative";

const TAG_GROUPS: Array<[Iterable<string>, Trait[]]> = [
  [SCRIPTING_TAGS, ["atom", "uncopied"]],
  [["head", "title"], ["atom"]],
  [PAGE_METADATA_TAGS, ["atom", "inline", "uncopied", "decorative"]],
  [MEDIA_TAGS, ["atom", "inline", "uncopied", "decorative"]],
  [["math"], ["atom", "inline"]],
  [FORM_FIELD_TAGS, ["atom", "inline", "uncopied"]],
  [FIELD_PART_TAGS, ["atom"]],
  [VALUE_TAGS, ["inline", "uncopied"]],
  [[...CODE_TAGS].filter((tag) => tag !== "pre"), ["atom", "inline"]],
  [["pre", "hr"], ["atom"]],
  [
    ["br", "wbr"],
    ["atom", "inline"],
  ],
  [
    [
      "a",
      "abbr",
      "b",
      "bdi",
      "bdo",
      "big",
      "cite",
      "data",
      "del",
      "dfn",
      "em",
      "font",
      "i",
      "ins",
      "label",
      "mark",
      "q",
      "ruby",
      "rt",
      "rp",
      "s",
      "small",
      "span",
      "strike",
      "strong",
      "sub",
      "sup",
      "time",
      "u",
    ],
    ["inline"],
  ],
];

const TAG_TRAITS = new Map<string, Set<Trait>>();
for (const [tags, traits] of TAG_GROUPS)
  for (const tag of tags) {
    const known = TAG_TRAITS.get(tag) ?? new Set<Trait>();
    traits.forEach((trait) => known.add(trait));
    TAG_TRAITS.set(tag, known);
  }

const hasTrait = (element: Element, trait: Trait) =>
  !!TAG_TRAITS.get(element.localName)?.has(trait);

// Headings and paragraphs keep a translation on its own line however short
// (see isTextBlock).
const TEXT_BLOCK_TAGS: ReadonlySet<string> = new Set([
  "p",
  ...HEADING_TAGS,
  "li",
  "blockquote",
  "dd",
  "dt",
  "figcaption",
  "caption",
]);

export function isCopiedInTranslation(element: Element) {
  return !hasTrait(element, "uncopied");
}

// Media, page metadata and icons decorate the text but aren't part of it.
// Icons: an element marked hidden from assistive technology, private-use
// characters of an icon font, a one-word ligature icon, or an empty element
// the page draws into with its style sheet.
const PRIVATE_USE = /^[\uE000-\uF8FF\s]+$/u;
const ICON_TAGS: ReadonlySet<string> = new Set(["i", "span"]);

export function isDecorative(element: Element) {
  if (hasTrait(element, "decorative")) return true;
  if (element.getAttribute("aria-hidden") === "true") return true;
  if (!hasTag(element, ICON_TAGS)) return false;
  if (!element.hasChildNodes()) return true;
  const text = (element.textContent || "").trim();
  if (PRIVATE_USE.test(text) && text) return true;
  return /^\p{L}[\p{L}_]*$/u.test(text) && isLigatureIcon(element);
}

// Dates and times marked up as such: the page's own labels for them stay
// (see metadata.ts).
function isTime(element: Element) {
  const tag = element.localName;
  return (
    tag === "time" || (tag.includes("-") && element.hasAttribute("datetime"))
  );
}

// Inline elements kept as they are inside a translated paragraph: the
// translation shows a copy of them in the same place (see
// isCopiedInTranslation).
export function isAtom(element: Element) {
  return (
    hasTrait(element, "atom") ||
    isTime(element) ||
    isNoTranslate(element) ||
    element.namespaceURI !== "http://www.w3.org/1999/xhtml"
  );
}

export function isOwn(node: Node) {
  return (
    node.nodeType === 1 && (node as Element).hasAttribute(TRANSLATION_ATTRIBUTE)
  );
}

// Marked not to translate (the `translate` attribute, or the `notranslate`
// class most translators follow), edited by the user, hidden, or code (see
// also isCodeView for code views drawn without code elements).
function isNoTranslate(element: Element) {
  const editable = element.getAttribute("contenteditable");
  return (
    element.getAttribute("translate") === "no" ||
    element.classList.contains("notranslate") ||
    (editable !== null && editable !== "false") ||
    element.getAttribute("aria-hidden") === "true" ||
    element.hasAttribute("hidden") ||
    element.getAttribute("role") === "code"
  );
}

// Left out together with everything inside.
export function isSkipped(element: Element) {
  return isOwn(element) || isAtom(element);
}

// Part of the text around it, unless it wraps blocks.
export function isInline(element: Element) {
  if (!hasTrait(element, "inline")) return false;
  return !element.querySelector(BLOCK_SELECTOR);
}

// Also a control whose label is content: a title (see isContentControl).
export function isTextBlock(element: Element) {
  return hasTag(element, TEXT_BLOCK_TAGS) || isContentControl(element);
}

export function isHeading(element: Element) {
  return (
    hasTag(element, HEADING_TAGS) || element.getAttribute("role") === "heading"
  );
}

// The page's own chrome, left as it is unless the user also translates
// menus and buttons: navigation, menus, tabs, toolbars, buttons, search,
// dialogs (cookie and sign-in prompts), and the page's header, footer and
// sidebars (outside the article: an article's own header holds its title).
// Notes fixed over the page are found by their style (see layout.ts).
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
const CONTROL_SELECTOR = [
  "button",
  "summary",
  ...[...CONTROL_ROLES].map((role) => `[role=${role}]`),
].join(",");
// Lists of links that work as controls: menus, tab bars, toolbars.
const CONTROL_LIST_SELECTOR =
  "nav, menu, [role=navigation], [role=menu], [role=menubar], [role=tablist], [role=toolbar], [role=listbox]";

// The control the element labels: a button, a tab, a menu item, or a link
// in a menu, tab bar or toolbar. Controls whose label is content (see
// isContentControl) are text, not controls.
export function controlOf(element: Element) {
  let control = element.closest(CONTROL_SELECTOR);
  while (control && isContentControl(control))
    control = control.parentElement?.closest(CONTROL_SELECTOR) ?? null;
  if (control) return control;
  const link = element.closest("a[href]");
  return link?.parentElement?.closest(CONTROL_LIST_SELECTOR) ? link : null;
}

// The control around the element whose label is content, if any.
export function contentControlOf(element: Element) {
  const control = element.closest(TITLE_CONTROL_SELECTOR);
  return control && isContentControl(control) ? control : null;
}

// Controls whose label is the page's content rather than its interface,
// translated like headings even while menus and buttons aren't: a label
// that reads as a sentence or asks a question ("How many saves can I
// upload?"), and the title of a section that opens and closes (see
// isDisclosureTitle). Short labels ("Log in", "Read more") are interface,
// and so is a control that opens a menu, a list or a dialog.
const TITLE_CONTROL_SELECTOR = "button, summary, [role=button]";
const SENTENCE_MIN_WORDS = 6;

export function isContentControl(control: Element) {
  if (!control.matches(TITLE_CONTROL_SELECTOR)) return false;
  const popup = control.getAttribute("aria-haspopup");
  if (popup !== null && popup !== "false") return false;
  if (isDisclosureTitle(control)) return true;
  const text = labelOf(control);
  return wordCount(text) >= SENTENCE_MIN_WORDS || isQuestion(text);
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
function labelOf(element: Element) {
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
    (control.localName === "a" &&
      !!control.parentElement?.closest(CONTROL_LIST_SELECTOR))
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

export function isChrome(element: Element) {
  if (isInterface(element)) return !isContentControl(element);
  if (element.getAttribute("aria-modal") === "true") return true;
  const role = element.getAttribute("role");
  return (
    (hasTag(element, PAGE_EDGE_TAGS) || role === "complementary") &&
    !element.parentElement?.closest(ARTICLE_SELECTOR)
  );
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

// Inline elements without attributes add nothing to the translation.
const PLAIN_WRAPPER_TAGS: ReadonlySet<string> = new Set(["span", "font"]);

export function isPlainWrapper(element: Element) {
  return hasTag(element, PLAIN_WRAPPER_TAGS) && !element.attributes.length;
}

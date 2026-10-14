// Which page elements are translated, and how. Decided by tag and attribute
// first; the page's styles are never read here (reading them on every
// element stalls large pages).

// The attribute on our own elements: translations and the style sheet.
export const TRANSLATION_ATTRIBUTE = "data-oba-translation";
export const TRANSLATION_TAG = "oba-translation";

// Never translated and never looked into.
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
  "OPTGROUP",
  "DATALIST",
  "PRE",
  "CODE",
  "KBD",
  "SAMP",
  "TT",
  "VAR",
  "SVG",
  "MATH",
  "CANVAS",
  "VIDEO",
  "AUDIO",
  "IFRAME",
  "FRAME",
  "OBJECT",
  "EMBED",
  "IMG",
  "PICTURE",
  "HEAD",
  "TITLE",
  "META",
  "LINK",
  "BR",
  "WBR",
  "HR",
]);

// Inline text-level elements: part of the paragraph around them.
const INLINE_TAGS = new Set([
  "A",
  "ABBR",
  "B",
  "BDI",
  "BDO",
  "BIG",
  "BR",
  "CITE",
  "CODE",
  "DATA",
  "DEL",
  "DFN",
  "EM",
  "FONT",
  "I",
  "IMG",
  "INS",
  "KBD",
  "LABEL",
  "MARK",
  "PICTURE",
  "Q",
  "RUBY",
  "RT",
  "RP",
  "S",
  "SAMP",
  "SMALL",
  "SPAN",
  "STRIKE",
  "STRONG",
  "SUB",
  "SUP",
  "SVG",
  "MATH",
  "TIME",
  "TT",
  "U",
  "VAR",
  "WBR",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "OUTPUT",
  "METER",
  "PROGRESS",
  "CANVAS",
  "VIDEO",
  "AUDIO",
  "IFRAME",
  "OBJECT",
  "EMBED",
]);

// Inline elements that are translated as a paragraph of their own: copying
// them into a translation would lose what they do when clicked.
const OWN_PARAGRAPH_TAGS = new Set(["BUTTON", "SUMMARY", "LEGEND"]);

// Block-level tags, to find inline elements that wrap blocks (card links).
export const BLOCK_SELECTOR = [
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
].join(",");

// Headings and paragraphs keep a translation on its own line however short.
const TEXT_BLOCK_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "BLOCKQUOTE",
  "DD",
  "DT",
  "FIGCAPTION",
  "CAPTION",
]);

// Code views and editors that aren't PRE or CODE.
const CODE_SELECTOR = [
  ".highlight",
  ".blob-code",
  ".react-code-text",
  ".CodeMirror",
  ".cm-editor",
  ".monaco-editor",
  ".ace_editor",
  ".sr-only",
  ".visually-hidden",
  ".notranslate",
].join(",");

// Atoms the translation leaves out: a copy of a form field or of media would
// be a second, dead one.
const UNCOPIED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "LINK",
  "META",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "OUTPUT",
  "METER",
  "PROGRESS",
  "IMG",
  "PICTURE",
  "SVG",
  "CANVAS",
  "VIDEO",
  "AUDIO",
  "IFRAME",
  "FRAME",
  "OBJECT",
  "EMBED",
]);

export function isCopiedInTranslation(element: Element) {
  return !UNCOPIED_TAGS.has(element.tagName.toUpperCase());
}

// Media and icons: they decorate the text but aren't part of it, so they
// are neither sent for translation nor shown again in the translation.
const DECORATIVE_TAGS = new Set([
  "IMG",
  "PICTURE",
  "SVG",
  "CANVAS",
  "VIDEO",
  "AUDIO",
  "IFRAME",
  "OBJECT",
  "EMBED",
]);
// Icon fonts: a class naming an icon set, or private-use characters.
const ICON_CLASS =
  /(^|[\s_-])(icons?|symbols?|glyph(icon)?s?|fa[srb]?)([\s_-]|$)/i;
const PRIVATE_USE = /^[\uE000-\uF8FF\s]+$/u;

export function isDecorative(element: Element) {
  const tag = element.tagName.toUpperCase();
  if (DECORATIVE_TAGS.has(tag)) return true;
  if (element.getAttribute("aria-hidden") === "true") return true;
  if (tag !== "I" && tag !== "SPAN") return false;
  const text = element.textContent || "";
  if (PRIVATE_USE.test(text) && text.trim()) return true;
  return (
    !/\s/.test(text.trim()) &&
    ICON_CLASS.test(element.getAttribute("class") || "")
  );
}

// Dates and times marked up as such: the page's own labels for them stay
// (see metadata.ts).
function isTime(element: Element) {
  const tag = element.tagName.toUpperCase();
  return (
    tag === "TIME" || (tag.includes("-") && element.hasAttribute("datetime"))
  );
}

// Inline elements kept as they are inside a translated paragraph: the
// translation shows a copy of them in the same place (see
// isCopiedInTranslation).
export function isAtom(element: Element) {
  return (
    SKIP_TAGS.has(element.tagName.toUpperCase()) ||
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

function isNoTranslate(element: Element) {
  const editable = element.getAttribute("contenteditable");
  return (
    element.getAttribute("translate") === "no" ||
    (editable !== null && editable !== "false") ||
    element.getAttribute("aria-hidden") === "true" ||
    element.hasAttribute("hidden") ||
    element.matches(CODE_SELECTOR)
  );
}

// Left out together with everything inside.
export function isSkipped(element: Element) {
  return isOwn(element) || isAtom(element);
}

// Part of the text around it, unless it wraps blocks.
export function isInline(element: Element) {
  const tag = element.tagName.toUpperCase();
  if (OWN_PARAGRAPH_TAGS.has(tag)) return false;
  if (!INLINE_TAGS.has(tag)) return false;
  return !element.querySelector(BLOCK_SELECTOR);
}

export function isTextBlock(element: Element) {
  return TEXT_BLOCK_TAGS.has(element.tagName.toUpperCase());
}

const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

export function isHeading(element: Element) {
  return (
    HEADING_TAGS.has(element.tagName.toUpperCase()) ||
    element.getAttribute("role") === "heading"
  );
}

// The page's own chrome, left as it is unless the user also translates
// menus and buttons: navigation, menus, tabs, toolbars, buttons, search,
// cookie notes, and the page's header, footer and sidebars (outside the
// article: an article's own header holds its title).
const CHROME_TAGS = new Set(["NAV", "MENU", "BUTTON", "SEARCH", "SUMMARY"]);
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
// in a menu, tab bar or toolbar.
export function controlOf(element: Element) {
  const control = element.closest(CONTROL_SELECTOR);
  if (control) return control;
  const link = element.closest("a[href]");
  return link?.parentElement?.closest(CONTROL_LIST_SELECTOR) ? link : null;
}

const PAGE_EDGE_TAGS = new Set(["HEADER", "FOOTER", "ASIDE"]);
const ARTICLE_SELECTOR = "main, article, [role=main], [role=article]";
// Cookie and consent notes, named so in their id, classes or label.
const NOTICE_WORDS = /cookie|consent|gdpr/i;
const NOTICE_KINDS =
  /^(cookies?|consent|gdpr)$|banner|bar$|notice|dialog|popup|modal|wall|overlay|sdk|root|cmp|message/i;

const NOTICE_LABEL = /banner|notice|dialog|consent|preferences|settings/i;

export function isChrome(element: Element) {
  const tag = element.tagName.toUpperCase();
  if (CHROME_TAGS.has(tag)) return true;
  const role = element.getAttribute("role");
  if (role && CHROME_ROLES.has(role)) return true;
  if (
    (PAGE_EDGE_TAGS.has(tag) || role === "complementary") &&
    !element.parentElement?.closest(ARTICLE_SELECTOR)
  )
    return true;
  return isNotice(element);
}

function isNotice(element: Element) {
  const label = element.getAttribute("aria-label");
  if (label && NOTICE_WORDS.test(label) && NOTICE_LABEL.test(label))
    return true;
  const names = `${element.id} ${element.getAttribute("class") || ""}`;
  if (!NOTICE_WORDS.test(names)) return false;
  return names
    .split(/\s+/)
    .some((name) => NOTICE_WORDS.test(name) && NOTICE_KINDS.test(name));
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
export function isPlainWrapper(element: Element) {
  const tag = element.tagName.toUpperCase();
  return (tag === "SPAN" || tag === "FONT") && !element.attributes.length;
}

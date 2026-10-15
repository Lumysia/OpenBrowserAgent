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
  HEADING_TAGS,
  MEDIA_TAGS,
  PAGE_METADATA_TAGS,
  SCRIPTING_TAGS,
  VALUE_TAGS,
} from "../shared/dom-vocabulary";
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
    isHiddenElement(element) ||
    element.getAttribute("role") === "code"
  );
}

// The attributes that hide content: the page sets them on what it shows
// later (a carousel's other slides), and the content is looked at again
// when they go (see units.ts).
export const HIDING_ATTRIBUTES = ["aria-hidden", "hidden"];

export function isHiddenElement(element: Element) {
  return (
    element.getAttribute("aria-hidden") === "true" ||
    element.hasAttribute("hidden")
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

// Paragraphs, headings and the like by their tag (see chrome.ts'
// isTextBlock for controls whose label is content).
export function isTextTag(element: Element) {
  return hasTag(element, TEXT_BLOCK_TAGS);
}

export function isHeading(element: Element) {
  return (
    hasTag(element, HEADING_TAGS) || element.getAttribute("role") === "heading"
  );
}

// Inline elements without attributes add nothing to the translation.
const PLAIN_WRAPPER_TAGS: ReadonlySet<string> = new Set(["span", "font"]);

export function isPlainWrapper(element: Element) {
  return hasTag(element, PLAIN_WRAPPER_TAGS) && !element.attributes.length;
}

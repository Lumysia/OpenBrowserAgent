// What the page tells the AI model about a batch besides its items (see
// shared/page-translate/context.ts): each item's role, the section headings
// and the text just before the batch's first item, and the page's
// description. Read from the page's structure only.
import { HEADING_SELECTOR } from "../shared/dom-vocabulary";
import {
  boundedContext,
  clipContext,
  PAGE_TRANSLATE_CONTEXT_LIMITS,
  PAGE_TRANSLATE_ROLE,
  type PageTranslateContext,
  type PageTranslateRole,
} from "../shared/page-translate/context";
import type { Paragraph } from "./blocks";
import { contentControlOf, controlOf, isMenuItem } from "./dom-rules";
import type { Unit } from "./units";

const CAPTION_SELECTOR = "figcaption, caption";
const LABEL_SELECTOR = "label, legend, dt, th";
// A heading marked only by its role is a level 2 one unless it says.
const DEFAULT_HEADING_LEVEL = 2;
// Roles whose text says nothing about the text after it.
const NOT_BEFORE: ReadonlySet<PageTranslateRole | undefined> = new Set([
  PAGE_TRANSLATE_ROLE.button,
  PAGE_TRANSLATE_ROLE.menu,
]);

// Paragraphs are replaced when the page changes, so their roles are found
// again then.
const roles = new WeakMap<Paragraph, PageTranslateRole | null>();

export function roleOf(paragraph: Paragraph): PageTranslateRole | undefined {
  let role = roles.get(paragraph);
  if (role === undefined) {
    role = findRole(paragraph) ?? null;
    roles.set(paragraph, role);
  }
  return role ?? undefined;
}

function findRole(paragraph: Paragraph): PageTranslateRole | undefined {
  const element = paragraph.parent;
  // A control whose label is content is a title (see isContentControl).
  if (element.closest(HEADING_SELECTOR) || contentControlOf(element))
    return PAGE_TRANSLATE_ROLE.heading;
  const control = controlOf(element);
  if (control)
    return isMenuItem(control)
      ? PAGE_TRANSLATE_ROLE.menu
      : PAGE_TRANSLATE_ROLE.button;
  if (element.closest(CAPTION_SELECTOR)) return PAGE_TRANSLATE_ROLE.caption;
  if (paragraph.inline || element.closest(LABEL_SELECTOR))
    return PAGE_TRANSLATE_ROLE.label;
  return undefined;
}

function headingLevel(paragraph: Paragraph) {
  const heading = paragraph.parent.closest(HEADING_SELECTOR);
  const tag = /^h([1-6])$/.exec(heading?.localName ?? "");
  if (tag) return Number(tag[1]);
  return Number(heading?.getAttribute("aria-level")) || DEFAULT_HEADING_LEVEL;
}

function precedes(a: Unit, b: Unit) {
  const node = a.paragraph.nodes[0];
  return !!(
    node.compareDocumentPosition(b.paragraph.nodes[0]) &
    node.DOCUMENT_POSITION_FOLLOWING
  );
}

// The section headings above the batch's first item (the nearest one and
// the nearest of a higher level above it) and the text just before it,
// from the page's other paragraphs.
export function batchContext(
  batch: Unit[],
  units: Iterable<Unit>,
): PageTranslateContext | undefined {
  if (!batch.length) return undefined;
  const inBatch = new Set(batch);
  const first = batch.reduce((a, b) => (precedes(b, a) ? b : a));
  let before: Unit | undefined;
  const headings: Unit[] = [];
  for (const unit of units) {
    if (inBatch.has(unit) || !precedes(unit, first)) continue;
    if (!before || precedes(before, unit)) before = unit;
    if (roleOf(unit.paragraph) === PAGE_TRANSLATE_ROLE.heading)
      headings.push(unit);
  }
  headings.sort((a, b) => (precedes(a, b) ? -1 : 1));
  const section: Unit[] = [];
  for (const heading of headings.reverse()) {
    const level = headingLevel(heading.paragraph);
    if (section.length && level >= headingLevel(section[0].paragraph)) continue;
    section.unshift(heading);
    if (section.length >= PAGE_TRANSLATE_CONTEXT_LIMITS.headings) break;
  }
  // Text the model sees anyway (a copy of an item or of a heading) isn't
  // repeated.
  const known = new Set(
    [...batch, ...section].map((unit) => unit.paragraph.source.plain),
  );
  const useBefore =
    before &&
    !known.has(before.paragraph.source.plain) &&
    !NOT_BEFORE.has(roleOf(before.paragraph));
  return boundedContext({
    headings: section.map((unit) => unit.paragraph.source.plain),
    before: useBefore ? before!.paragraph.source.plain : undefined,
  });
}

// The page's own summary of itself.
export function pageDescription(document: Document) {
  for (const selector of [
    "meta[name=description]",
    'meta[property="og:description"]',
  ]) {
    const content = document.head
      ?.querySelector(selector)
      ?.getAttribute("content");
    if (content?.trim())
      return clipContext(content, PAGE_TRANSLATE_CONTEXT_LIMITS.description);
  }
  return undefined;
}

import { BLOCK_TAGS, hasTag } from "../shared/dom-vocabulary";
import { compact } from "../shared/text";
import {
  children,
  clip,
  CONTROL_CANDIDATES,
  isHidden,
  isInteractive,
  isSkipped,
  roleOf,
} from "./dom";
import { watchMutations } from "./page-mutations";

// Text that appeared or changed during a batch, in the viewport: a question
// shown after Start, a score, a countdown. Text is grouped by its block:
// the nearest block element by markup, element with a role, live region,
// custom element or shadow host. Only the viewport's neighbourhood is read,
// by markup rather than computed style, so a batch costs the same on long
// pages; the page's mutations tell whether text that was not read before
// the batch is new. Text inside controls is left to the control diff.

// Live regions name themselves first: they are how pages announce changes.
const LIVE_ROLES = new Set(["status", "alert", "timer", "log", "marquee"]);
// Blocks listed per batch, characters of each, and of the old text shown.
const TEXT_LISTED = 8;
const TEXT_LINE_MAX_CHARS = 120;
const WAS_MAX_CHARS = 40;
const TICKING_LISTED = 2;
// Text kept per block for comparing, so long articles stay cheap.
const STORED_MAX_CHARS = 400;
// Screens above and below the viewport read before a batch: a click
// scrolls its target into view.
const BEFORE_SCREENS = 1;

export type PageTexts = { texts: Map<Element, string>; read: Set<Element> };

function liveRole(element: Element) {
  const role = roleOf(element);
  if (LIVE_ROLES.has(role)) return role;
  if (element.localName === "output") return "status";
  const live = element.getAttribute("aria-live");
  return live && live !== "off" ? "live" : "";
}

// `blocks` caches the answer for one read of the page.
function blockOf(
  element: Element,
  blocks = new Map<Element, Element>(),
): Element {
  const known = blocks.get(element);
  if (known) return known;
  const parent =
    element.parentElement ||
    ((element.getRootNode() as ShadowRoot).host ?? null);
  const found =
    !parent ||
    hasTag(element, BLOCK_TAGS) ||
    element.hasAttribute("role") ||
    element.hasAttribute("aria-live") ||
    element.localName === "output" ||
    element.localName.includes("-") ||
    !!element.shadowRoot
      ? element
      : blockOf(parent, blocks);
  blocks.set(element, found);
  return found;
}

let mutations: ReturnType<typeof watchMutations> | undefined;

// The text of every visible block within `screens` of the viewport, and
// every element read.
function readTexts(screens: number): PageTexts {
  const top = -innerHeight * screens;
  const bottom = innerHeight * (1 + screens);
  const parts = new Map<Element, string[]>();
  const read = new Set<Element>();
  const blocks = new Map<Element, Element>();
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      const parent = node.parentElement;
      if (!parent || !text.trim()) return;
      const block = blockOf(parent, blocks);
      const list = parts.get(block);
      if (list) list.push(text);
      else parts.set(block, [text]);
      return;
    }
    if (!(node instanceof Element) || isSkipped(node)) return;
    // Controls are reported by the control diff, with their state; links
    // are part of the prose around them.
    if (node.matches(CONTROL_CANDIDATES)) {
      const role = roleOf(node);
      if (isInteractive(node, role) && role !== "link") return;
    }
    const rect = node.getBoundingClientRect();
    // Boxless elements (display: contents) still hold content.
    if ((rect.width || rect.height) && (rect.bottom < top || rect.top > bottom))
      return;
    read.add(node);
    for (const child of children(node)) walk(child);
  };
  walk(document.body || document.documentElement);
  const texts = new Map<Element, string>();
  for (const [block, list] of parts) {
    const text = compact(list.join(" "));
    if (text && !isHidden(block))
      texts.set(block, text.slice(0, STORED_MAX_CHARS));
  }
  return { texts, read };
}

export function beginTexts(): PageTexts {
  mutations ??= watchMutations((element) => blockOf(element));
  mutations.begin();
  return readTexts(BEFORE_SCREENS);
}

function inView(element: Element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= 0 &&
    rect.top <= innerHeight &&
    rect.right >= 0 &&
    rect.left <= innerWidth
  );
}

const label = (block: Element) =>
  liveRole(block) || (roleOf(block) === "heading" ? "heading" : "text");

type Found = { block: Element; text: string; was?: string; rank: number };

// Lines for text in the viewport that is new or changed since `before`.
// Blocks that also changed in the gap before the batch (clocks,
// countdowns) are `ticking`: shown once, briefly, and not a change.
export function textChanges(before: PageTexts, skip: Element[]) {
  mutations?.end();
  const found: Found[] = [];
  const ticking: string[] = [];
  for (const [block, text] of readTexts(0).texts) {
    const was = before.texts.get(block);
    if (was === text || !inView(block)) continue;
    if (skip.some((root) => root.contains(block))) continue;
    // Not read before the batch: new only when the batch touched it.
    if (!before.read.has(block) && !mutations?.touched(block)) continue;
    if (was !== undefined && mutations?.ticks(block)) {
      ticking.push(`${label(block)}: ${clip(text, WAS_MAX_CHARS)}`);
      continue;
    }
    const rank = liveRole(block) ? 0 : label(block) === "heading" ? 1 : 2;
    found.push({ block, text, was, rank });
  }
  const shown = new Set(
    [...found].sort((a, b) => a.rank - b.rank).slice(0, TEXT_LISTED),
  );
  const line = (item: Found) =>
    `- ${label(item.block)}: ${clip(item.text, TEXT_LINE_MAX_CHARS)}${item.was === undefined ? "" : ` (was: ${clip(item.was, WAS_MAX_CHARS)})`}`;
  const lines: string[] = [];
  // Page order within each group, as the page reads.
  const group = (title: string, items: Found[]) => {
    if (items.length) lines.push(title, ...items.map(line));
  };
  group(
    "New text:",
    found.filter((item) => item.was === undefined && shown.has(item)),
  );
  group(
    "Text changed:",
    found.filter((item) => item.was !== undefined && shown.has(item)),
  );
  if (found.length > shown.size)
    lines.push(`- … ${found.length - shown.size} more (take a snapshot)`);
  return {
    lines,
    ticking: ticking.length
      ? [`Ticking: ${ticking.slice(0, TICKING_LISTED).join("; ")}`]
      : [],
  };
}

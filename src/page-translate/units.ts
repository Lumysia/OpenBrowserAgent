// The page's paragraphs while it is translated, kept in step with the page:
// new content is found, and paragraphs whose text changed are translated
// again once the text has stopped changing.
import { walkParagraphs, type Paragraph } from "./blocks";
import { isInline, isOwn, TRANSLATION_ATTRIBUTE } from "./dom-rules";
import { yieldToMain } from "./yield";

export type UnitState = "idle" | "queued" | "sent" | "done" | "failed";

export type Unit = {
  id: number;
  paragraph: Paragraph;
  // What the observers watch for this paragraph.
  target: Element;
  element?: HTMLElement;
  state: UnitState;
  near: boolean;
  visible: boolean;
};

// How long the page's changes must pause before they are looked at, and the
// longest they wait while the page keeps changing.
const STABLE_MS = 400;
const MAX_WAIT_MS = 2_000;
// Time slices for walking the page.
const SLICE_MS = 12;

export type UnitEvents = {
  added: (unit: Unit) => void;
  removed: (unit: Unit) => void;
};

export function createUnits(events: UnitEvents) {
  const units = new Map<number, Unit>();
  let nextId = 1;
  let alive = true;
  let observer: MutationObserver | undefined;
  const dirty = new Set<Element>();
  let timer: number | undefined;
  let firstDirtyAt = 0;

  const register = (paragraph: Paragraph) => {
    const firstElement = paragraph.nodes.find((node) => node.nodeType === 1) as
      Element | undefined;
    const unit: Unit = {
      id: nextId++,
      paragraph,
      target: paragraph.whole
        ? paragraph.parent
        : firstElement || paragraph.parent,
      state: "idle",
      near: false,
      visible: false,
    };
    units.set(unit.id, unit);
    events.added(unit);
  };

  const remove = (unit: Unit) => {
    units.delete(unit.id);
    events.removed(unit);
  };

  // Walks `root` in slices; `known` paragraphs (same block, same text) stay.
  const scan = async (root: Element, known: Unit[] = []) => {
    const byKey = new Map<string, Unit[]>();
    for (const unit of known) {
      const key = unit.paragraph.source.text;
      byKey.set(key, [...(byKey.get(key) || []), unit]);
    }
    const kept = new Set<Unit>();
    let deadline = performance.now() + SLICE_MS;
    for (const paragraph of walkParagraphs(root)) {
      if (!alive) return;
      if (paragraph) {
        const match = byKey
          .get(paragraph.source.text)
          ?.find(
            (unit) =>
              !kept.has(unit) && unit.paragraph.parent === paragraph.parent,
          );
        if (match) {
          kept.add(match);
          match.paragraph = { ...paragraph };
        } else register(paragraph);
      }
      if (performance.now() > deadline) {
        await yieldToMain();
        deadline = performance.now() + SLICE_MS;
      }
    }
    for (const unit of known) if (!kept.has(unit)) remove(unit);
  };

  const process = async () => {
    timer = undefined;
    firstDirtyAt = 0;
    const roots = [...dirty].filter(
      (root) =>
        root.isConnected &&
        ![...dirty].some((other) => other !== root && other.contains(root)),
    );
    dirty.clear();
    // Paragraphs that left the page.
    for (const unit of [...units.values()])
      if (!unit.paragraph.parent.isConnected) remove(unit);
    for (const root of roots) {
      const known = [...units.values()].filter((unit) =>
        root.contains(unit.paragraph.parent),
      );
      await scan(root, known);
    }
  };

  const onMutations = (records: MutationRecord[]) => {
    for (const record of records) {
      if (insideOwn(record.target)) continue;
      if (
        record.type === "childList" &&
        [...record.addedNodes, ...record.removedNodes].every(isOwn)
      )
        continue;
      const root = blockAncestor(record.target);
      if (root) dirty.add(root);
    }
    if (!dirty.size) return;
    const now = performance.now();
    firstDirtyAt ||= now;
    clearTimeout(timer);
    const wait = Math.max(
      0,
      Math.min(STABLE_MS, firstDirtyAt + MAX_WAIT_MS - now),
    );
    timer = window.setTimeout(() => void process(), wait);
  };

  return {
    units,
    async start(root: Element) {
      observer = new MutationObserver(onMutations);
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      await scan(root);
    },
    stop() {
      alive = false;
      observer?.disconnect();
      clearTimeout(timer);
      dirty.clear();
      units.clear();
    },
  };
}

function insideOwn(node: Node) {
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return !!element?.closest(`[${TRANSLATION_ATTRIBUTE}]`);
}

// The nearest block around a change: where its paragraphs are found again.
function blockAncestor(node: Node) {
  let element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  while (element && isInline(element) && element.parentElement)
    element = element.parentElement;
  return element ?? undefined;
}

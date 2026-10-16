// Which text blocks the page changed, inside and between act batches. A
// block that changes between batches changes on its own (a clock, a
// countdown); one that changes during a batch may have changed because of
// it.

const REVEAL_ATTRIBUTES = ["class", "style", "hidden", "open", "aria-hidden"];
// A block that changed outside a batch this recently is ticking.
const TICKING_WINDOW_MS = 5_000;

export function watchMutations(blockOf: (element: Element) => Element) {
  let inBatch = false;
  // When each block last changed outside a batch.
  const ticked = new WeakMap<Element, number>();
  let began = 0;
  let blocks = new Set<Element>();
  let targets = new Set<Element>();
  const record = (records: MutationRecord[]) => {
    for (const item of records) {
      const target =
        item.target instanceof Element
          ? item.target
          : item.target.parentElement;
      if (!target) continue;
      if (!inBatch) {
        if (item.type !== "attributes")
          ticked.set(blockOf(target), performance.now());
        continue;
      }
      // Added content and changed attributes reach every block inside.
      if (item.type !== "characterData") targets.add(target);
      if (item.type !== "attributes") blocks.add(blockOf(target));
    }
  };
  const observer = new MutationObserver(record);
  observer.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: REVEAL_ATTRIBUTES,
  });
  return {
    begin() {
      record(observer.takeRecords());
      inBatch = true;
      began = performance.now();
      blocks = new Set();
      targets = new Set();
    },
    end() {
      record(observer.takeRecords());
      inBatch = false;
    },
    ticks: (block: Element) =>
      began - (ticked.get(block) ?? -Infinity) < TICKING_WINDOW_MS,
    // Whether the batch changed the block's text, added it or may have
    // revealed it.
    touched(block: Element) {
      if (blocks.has(block)) return true;
      for (let node: Element | null = block; node; node = node.parentElement)
        if (targets.has(node)) return true;
      return false;
    },
  };
}

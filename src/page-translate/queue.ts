// What to translate next: paragraphs on screen before those just below or
// above it, each group in page order, in batches sized for the engine.
import type { PageTranslateBatchLimits } from "../shared/page-translate/protocol";

export const PRIORITY = {
  // In the viewport.
  visible: 0,
  // Within a few screens of it.
  near: 1,
} as const;

export type QueuedItem = {
  id: number;
  text: string;
  priority: number;
};

export function createQueue() {
  const items = new Map<number, QueuedItem>();
  return {
    // Adds or reprioritizes.
    set(item: QueuedItem) {
      items.set(item.id, item);
    },
    delete(id: number) {
      items.delete(id);
    },
    has(id: number) {
      return items.has(id);
    },
    get size() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    // Takes the next batch: at most `maxItems` items and `maxChars`
    // characters (a longer item goes alone), `firstItems` for the first.
    take(limits: PageTranslateBatchLimits, first: boolean): QueuedItem[] {
      const ordered = [...items.values()].sort(
        (a, b) => a.priority - b.priority || a.id - b.id,
      );
      const maxItems = first ? limits.firstItems : limits.maxItems;
      const batch: QueuedItem[] = [];
      let chars = 0;
      for (const item of ordered) {
        if (batch.length >= maxItems) break;
        if (batch.length && chars + item.text.length > limits.maxChars) break;
        batch.push(item);
        chars += item.text.length;
      }
      for (const item of batch) items.delete(item.id);
      return batch;
    },
  };
}

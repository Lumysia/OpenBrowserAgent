// The page's own text while translation-only display has replaced it in
// place: the paragraphs are still found and compared by what the page
// wrote, not by our translation.

type Swapped = { original: string; ours: string };

const swapped = new WeakMap<Text, Swapped>();
let count = 0;

export function setSwapped(node: Text, original: string, ours: string) {
  if (!swapped.has(node)) count++;
  swapped.set(node, { original, ours });
}

// The page's text again; false when the page has changed the node since.
export function restoreSwapped(node: Text) {
  const entry = swapped.get(node);
  if (!entry) return false;
  forgetSwapped(node);
  if (node.data !== entry.ours) return false;
  node.data = entry.original;
  return true;
}

// The page wrote its own text over ours: that is the original now.
export function forgetSwapped(node: Text) {
  if (swapped.delete(node)) count--;
}

// Whether the node holds our text (not text the page wrote since).
export function isSwapped(node: Node) {
  const entry = swapped.get(node as Text);
  return !!entry && (node as Text).data === entry.ours;
}

// The text the page has in the node.
export function originalText(node: Text) {
  if (!count) return node.data;
  const entry = swapped.get(node);
  return entry && node.data === entry.ours ? entry.original : node.data;
}

// The page's text in the element, as `textContent` reads it.
export function originalContent(node: Node): string {
  if (!count) return node.textContent || "";
  if (node.nodeType === 3) return originalText(node as Text);
  if (node.nodeType !== 1 && node.nodeType !== 11) return "";
  let text = "";
  for (const child of node.childNodes) text += originalContent(child);
  return text;
}

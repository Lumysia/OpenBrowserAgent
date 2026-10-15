// A sample of the page's readable text for the language detector: from its
// main content when the page marks one, without code, form fields, hidden
// parts and text marked not to translate.
const SKIPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "CODE",
  "PRE",
  "KBD",
  "SAMP",
  "TEXTAREA",
  "SELECT",
  "svg",
  "math",
]);

function skipped(element: Element) {
  return (
    SKIPPED_TAGS.has(element.tagName) ||
    element.getAttribute("translate") === "no" ||
    element.getAttribute("aria-hidden") === "true" ||
    element.hasAttribute("hidden")
  );
}

export function pageTextSample(limit: number) {
  const root =
    document.querySelector("main, [role='main'], article") ?? document.body;
  if (!root) return "";
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    (node) =>
      node.nodeType === Node.ELEMENT_NODE && skipped(node as Element)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  );
  let text = "";
  while (text.length < limit && walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const words = node.nodeValue?.replace(/\s+/g, " ").trim();
    if (words) text += `${words} `;
  }
  return text.slice(0, limit).trim();
}

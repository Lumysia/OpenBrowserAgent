// A path to an element by tags and their places among siblings only, so
// it finds the same part of the page after a reload: a page watch reads it
// (see tasks), and a recording keeps it as a last-resort hint. Shared by the
// element picker and the recorder so both describe elements the same way.
export function structuralPath(element: Element) {
  const steps: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.body && node !== document.documentElement) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const tag = node.tagName.toLowerCase();
    const same = Array.from(parent.children).filter(
      (child) => child.tagName === node!.tagName,
    );
    steps.unshift(
      same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag,
    );
    node = parent;
  }
  return ["body", ...steps].join(" > ");
}

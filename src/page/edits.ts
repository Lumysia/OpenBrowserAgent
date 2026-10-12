import { compact } from "./dom";
import { refFor, resolveRef } from "./refs";

// `editPage` operations, run in the page in order; the batch stops at the
// first failure. Markup never carries script: page JavaScript is a separate,
// default-off tool group.

export type EditOp = {
  op: string;
  ref?: string;
  text?: string;
  html?: string;
  position?: string;
  tag?: string;
  name?: string;
  value?: string;
};

export type EditResult = {
  applied: number;
  inserted: string[];
  error?: string;
};

export function runEdits(ops: EditOp[]): EditResult {
  const inserted: string[] = [];
  for (const [index, op] of ops.entries()) {
    try {
      const ref = apply(op);
      if (ref) inserted.push(ref);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        applied: index,
        inserted,
        error: `Edit ${index + 1} (${op.op}${op.ref ? ` ${op.ref}` : ""}) failed: ${message}`,
      };
    }
  }
  return { applied: ops.length, inserted };
}

function apply(op: EditOp): string | undefined {
  const element = resolveRef(op.ref);
  switch (op.op) {
    case "setText":
      setText(element, op.text ?? "");
      return;
    case "insert":
      return refFor(insert(element, op));
    case "remove":
      element.remove();
      return;
    case "setAttribute": {
      const name = (op.name || "").trim();
      if (!name) throw new Error("name is required.");
      if (unsafeAttribute(name, op.value ?? ""))
        throw new Error(
          `Attribute ${name} is not allowed (no script in edits).`,
        );
      element.setAttribute(name, op.value ?? "");
      return;
    }
    case "removeAttribute":
      element.removeAttribute((op.name || "").trim());
      return;
    case "style":
      if (!(element instanceof HTMLElement || element instanceof SVGElement))
        throw new Error("This element has no inline style.");
      element.style.cssText = [element.style.cssText, op.value || ""]
        .filter(Boolean)
        .join("; ");
      return;
    default:
      throw new Error(
        `Unknown op "${op.op}". Use setText, insert, remove, setAttribute, removeAttribute, style or css.`,
      );
  }
}

// Replaces the text of a block. Links and controls the snapshot showed as
// [label](e12) can be kept by writing them the same way; the element moves
// into place with the new label.
function setText(element: Element, text: string) {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
    throw new Error("This is a form field. Use act with a type step.");
  if ((element as HTMLElement).isContentEditable)
    throw new Error("This is an editor. Use act with a type step.");
  const nodes: Node[] = [];
  // Labels may contain brackets themselves, like a citation "[16]".
  const pattern = /\[((?:[^[\]]|\[[^\]]*\])*)\]\((e\d+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    let child: Element | undefined;
    try {
      child = resolveRef(match[2]);
    } catch {
      child = undefined;
    }
    if (!child || !element.contains(child) || child === element) continue;
    if (match.index! > last)
      nodes.push(document.createTextNode(text.slice(last, match.index)));
    child.textContent = match[1];
    nodes.push(child);
    last = match.index! + match[0].length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  element.replaceChildren(...nodes);
}

function insert(element: Element, op: EditOp) {
  const position = op.position || "after";
  const sibling = position === "before" || position === "after";
  let node: Element;
  if (op.html) {
    const template = document.createElement("template");
    template.innerHTML = op.html;
    const content = sanitize(template.content);
    const wrapper = document.createElement(op.tag || "div");
    // Clone after stripping: an isolated-world parse may already have bound
    // handlers of removed on* attributes.
    wrapper.append(document.importNode(content, true));
    node =
      wrapper.childElementCount === 1 && !compact(textOutside(wrapper))
        ? wrapper.firstElementChild!
        : wrapper;
  } else {
    const tag = /^[a-z][a-z0-9-]*$/i.test(op.tag || "")
      ? op.tag!
      : sibling
        ? element.localName
        : "span";
    node = document.createElement(tag);
    if (sibling && tag === element.localName && element.className)
      node.className = element.className;
    node.textContent = op.text ?? "";
  }
  node.setAttribute("data-oba-inserted", "");
  if (position === "before") element.before(node);
  else if (position === "after") element.after(node);
  else if (position === "prepend") element.prepend(node);
  else if (position === "append") element.append(node);
  else
    throw new Error(
      `Unknown position "${position}". Use before, after, prepend or append.`,
    );
  return node;
}

function textOutside(wrapper: Element) {
  return Array.from(wrapper.childNodes)
    .filter((child) => child.nodeType === Node.TEXT_NODE)
    .map((child) => child.textContent)
    .join("");
}

function unsafeAttribute(name: string, value: string) {
  return (
    /^on/i.test(name) ||
    name.toLowerCase() === "srcdoc" ||
    /^(javascript|vbscript):/i.test(value.replace(/[\s\u0000-\u001f]/g, ""))
  );
}

function sanitize(root: DocumentFragment) {
  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (["script", "iframe", "object", "embed"].includes(element.localName))
      element.remove();
    if (element instanceof HTMLTemplateElement) sanitize(element.content);
    for (const { name, value } of Array.from(element.attributes))
      if (unsafeAttribute(name, value)) element.removeAttribute(name);
  }
  return root;
}

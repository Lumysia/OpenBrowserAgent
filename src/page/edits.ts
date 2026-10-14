import { compact } from "../shared/text";
import { refFor, resolveRef } from "./refs";

// `editPage` operations, run in the page in order; the batch stops at the
// first failure. Edits never run or load script or frames: page JavaScript
// is a separate, default-off tool group. Every path (insert, html, attribute
// changes) goes through the same allowlist of tags and attributes.

const SAFE_TAGS = new Set(
  `a abbr address article aside b bdi bdo blockquote br button caption cite code col colgroup data dd del details dfn div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i img input ins kbd label legend li main mark nav ol option p pre q rp rt ruby s samp section select small span strong sub summary sup table tbody td textarea tfoot th thead time tr u ul var wbr`.split(
    " ",
  ),
);
const SAFE_ATTRIBUTES = new Set(
  `alt checked cite class colspan datetime dir disabled for headers height hidden href id lang loading name open placeholder readonly rel reversed role rowspan scope selected span src srcset start style tabindex target title type value width`.split(
    " ",
  ),
);
const URL_ATTRIBUTES = new Set(["href", "src", "srcset", "cite"]);

function checkTag(tag: string) {
  if (!SAFE_TAGS.has(tag.toLowerCase()))
    throw new Error(
      `<${tag}> is not allowed in edits (no script, frames, embedded objects or custom elements). Use plain HTML such as div, p, span, a, img, table or list elements.`,
    );
}

function checkAttribute(name: string, value: string) {
  const key = name.toLowerCase();
  if (!SAFE_ATTRIBUTES.has(key) && !/^(aria|data)-[a-z0-9-]+$/.test(key))
    throw new Error(
      `Attribute ${name} is not allowed in edits (no event handlers or script).`,
    );
  const plain = value.replace(/[\s\u0000-\u001f]/g, "").toLowerCase();
  if (/(java|vb|live)script:/.test(plain))
    throw new Error(`Attribute ${name} cannot hold a script URL.`);
  if (
    URL_ATTRIBUTES.has(key) &&
    plain.includes("data:") &&
    !/^data:image\//.test(plain)
  )
    throw new Error(`Attribute ${name} cannot hold a data URL.`);
}

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
      checkAttribute(name, op.value ?? "");
      // A URL on a frame, script or object element would load it.
      if (URL_ATTRIBUTES.has(name.toLowerCase())) checkTag(element.localName);
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
    checkMarkup(template.content);
    const tag = op.tag || "div";
    checkTag(tag);
    const wrapper = document.createElement(tag);
    wrapper.append(document.importNode(template.content, true));
    node =
      wrapper.childElementCount === 1 && !compact(textOutside(wrapper))
        ? wrapper.firstElementChild!
        : wrapper;
  } else {
    const tag =
      op.tag ||
      (sibling && SAFE_TAGS.has(element.localName)
        ? element.localName
        : "span");
    checkTag(tag);
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

// Markup the model wrote is refused as a whole if any part is not allowed,
// so nothing is silently dropped.
function checkMarkup(root: DocumentFragment) {
  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (element.namespaceURI !== "http://www.w3.org/1999/xhtml")
      throw new Error(
        `<${element.localName}> is not allowed in edits (no SVG or MathML markup).`,
      );
    checkTag(element.localName);
    for (const { name, value } of Array.from(element.attributes))
      checkAttribute(name, value);
  }
}

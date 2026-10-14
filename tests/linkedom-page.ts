import { parseHTML } from "linkedom";

// Inherited text properties the page-translate rules read, and their
// initial values.
const INHERITED: Record<string, string> = {
  "white-space": "normal",
  "font-family": "serif",
  "font-feature-settings": "normal",
};

const camel = (name: string) =>
  name.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());

function declared(element: Element, name: string) {
  for (const rule of (element.getAttribute("style") || "").split(";")) {
    const [property, ...value] = rule.split(":");
    if (property?.trim() === name) return value.join(":").trim();
  }
  return undefined;
}

const FOLLOWING = 4;
const PRECEDING = 2;
const CONTAINS = 8;
const CONTAINED_BY = 16;

// Document order as browsers report it; linkedom compares nodes by depth.
function compareDocumentPosition(this: Node, other: Node) {
  if (this === other) return 0;
  const chain = (node: Node) => {
    const nodes: Node[] = [];
    for (let at: Node | null = node; at; at = at.parentNode) nodes.unshift(at);
    return nodes;
  };
  const mine = chain(this);
  const theirs = chain(other);
  let depth = 0;
  while (mine[depth] && mine[depth] === theirs[depth]) depth++;
  if (depth === mine.length) return FOLLOWING | CONTAINED_BY;
  if (depth === theirs.length) return PRECEDING | CONTAINS;
  const siblings = [...mine[depth - 1].childNodes];
  return siblings.indexOf(mine[depth] as ChildNode) <
    siblings.indexOf(theirs[depth] as ChildNode)
    ? FOLLOWING
    : PRECEDING;
}

// A parsed page (linkedom has no layout): computed styles are the inline
// `style` attributes with inheritance, enough for the rules that read
// inherited text properties.
export function parsePage(html: string) {
  const parsed = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  let nodePrototype = Object.getPrototypeOf(parsed.document.createTextNode(""));
  while (!Object.hasOwn(nodePrototype, "compareDocumentPosition"))
    nodePrototype = Object.getPrototypeOf(nodePrototype);
  Object.assign(nodePrototype, {
    compareDocumentPosition,
    DOCUMENT_POSITION_FOLLOWING: FOLLOWING,
  });
  (parsed.window as unknown as Window).getComputedStyle = ((
    element: Element,
  ) => {
    const style: Record<string, string> = {};
    for (const [name, initial] of Object.entries(INHERITED)) {
      let value: string | undefined;
      for (
        let current: Element | null = element;
        current && value === undefined;
        current = current.parentElement
      )
        value = declared(current, name);
      style[camel(name)] = value ?? initial;
    }
    return style as unknown as CSSStyleDeclaration;
  }) as Window["getComputedStyle"];
  return parsed;
}

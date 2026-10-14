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

// A parsed page (linkedom has no layout): computed styles are the inline
// `style` attributes with inheritance, enough for the rules that read
// inherited text properties.
export function parsePage(html: string) {
  const parsed = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
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

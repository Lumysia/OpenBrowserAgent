// What the page tells the AI model about a batch besides its items: the
// page's description, the section the items are in, the text just before
// them and what each item is on the page. Reference only: the model reads
// it to understand the items and doesn't translate it. Dependency-free: the
// page script imports this module.

// What an item is on the page, where the page's structure says so. Items
// without a role are running text.
export const PAGE_TRANSLATE_ROLE = {
  heading: "heading",
  button: "button",
  menu: "menu item",
  label: "label",
  caption: "caption",
} as const;

export type PageTranslateRole =
  (typeof PAGE_TRANSLATE_ROLE)[keyof typeof PAGE_TRANSLATE_ROLE];

const ROLES: ReadonlySet<string> = new Set(Object.values(PAGE_TRANSLATE_ROLE));

export function isPageTranslateRole(
  value: unknown,
): value is PageTranslateRole {
  return typeof value === "string" && ROLES.has(value);
}

export type PageTranslateContext = {
  // The section headings above the first item, outermost first.
  headings?: string[];
  // The page's text just before the first item.
  before?: string;
};

// Characters of each part, so a request's context stays small.
export const PAGE_TRANSLATE_CONTEXT_LIMITS = {
  description: 300,
  heading: 120,
  headings: 2,
  before: 200,
} as const;

// `text` cut to `max` characters at a word boundary, keeping its start, or
// its end for the text just before the items.
export function clipContext(
  text: string,
  max: number,
  keep: "start" | "end" = "start",
) {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  if (keep === "end") {
    const tail = value.slice(value.length - max + 1);
    const space = tail.indexOf(" ");
    return `…${space > 0 && space < max / 2 ? tail.slice(space + 1) : tail}`;
  }
  const head = value.slice(0, max - 1);
  const space = head.lastIndexOf(" ");
  return `${space > max / 2 ? head.slice(0, space) : head}…`;
}

// The context as it may be sent: known parts only, each within its limit.
export function boundedContext(
  context: PageTranslateContext | undefined,
): PageTranslateContext | undefined {
  if (!context) return undefined;
  const limits = PAGE_TRANSLATE_CONTEXT_LIMITS;
  const headings = (Array.isArray(context.headings) ? context.headings : [])
    .filter((heading) => typeof heading === "string" && heading.trim())
    .slice(-limits.headings)
    .map((heading) => clipContext(heading, limits.heading));
  const before =
    typeof context.before === "string" && context.before.trim()
      ? clipContext(context.before, limits.before, "end")
      : undefined;
  if (!headings.length && !before) return undefined;
  return {
    ...(headings.length ? { headings } : {}),
    ...(before ? { before } : {}),
  };
}

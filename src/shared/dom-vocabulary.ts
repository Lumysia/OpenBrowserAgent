// The HTML vocabulary the page scripts (page tools, page translation, smart
// bar) share: tag groups by what the elements are, and small structural
// helpers. Each group is defined once here; scripts build their own rules
// from them. Tag names are lowercase local names. Dependency-free.

export const HEADING_TAGS: ReadonlySet<string> = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);
export const HEADING_SELECTOR = `${[...HEADING_TAGS].join(", ")}, [role=heading]`;

// Not rendered: scripting, templates and the document's metadata (wikis
// write `link` and `meta` into the middle of a sentence).
export const SCRIPTING_TAGS: ReadonlySet<string> = new Set([
  "script",
  "style",
  "noscript",
  "template",
]);
export const PAGE_METADATA_TAGS: ReadonlySet<string> = new Set([
  "link",
  "meta",
]);
export const NON_RENDERED_TAGS: ReadonlySet<string> = new Set([
  ...SCRIPTING_TAGS,
  ...PAGE_METADATA_TAGS,
  "head",
  "title",
  "base",
]);

// Embedded content: pictures, media and frames.
export const MEDIA_TAGS: ReadonlySet<string> = new Set([
  "img",
  "picture",
  "svg",
  "canvas",
  "video",
  "audio",
  "iframe",
  "frame",
  "object",
  "embed",
]);

// Fields the user edits, and the parts of their pickers.
export const FORM_FIELD_TAGS: ReadonlySet<string> = new Set([
  "input",
  "select",
  "textarea",
]);
export const FIELD_PART_TAGS: ReadonlySet<string> = new Set([
  "option",
  "optgroup",
  "datalist",
]);
// Elements that show a value: the page sets their content.
export const VALUE_TAGS: ReadonlySet<string> = new Set([
  "output",
  "meter",
  "progress",
]);

// Computer text: code, keyboard input, program output, variables.
export const CODE_TAGS: ReadonlySet<string> = new Set([
  "pre",
  "code",
  "kbd",
  "samp",
  "tt",
  "var",
]);

// Elements the default style sheet renders as blocks.
export const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "center",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  ...HEADING_TAGS,
  "header",
  "hgroup",
  "hr",
  "html",
  "li",
  "main",
  "menu",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);
export const BLOCK_SELECTOR = [...BLOCK_TAGS].join(",");

// Sectioning elements: a header or footer inside one belongs to it, not to
// the page.
export const SECTIONING_SELECTOR = "article, aside, main, nav, section";

export function hasTag(element: Element, tags: ReadonlySet<string>) {
  return tags.has(element.localName);
}

// The outermost editable element around the node (its editing host), when
// the node is inside editable content.
export function editingHost(node: Node | null): HTMLElement | undefined {
  const start = node instanceof Element ? node : node?.parentElement;
  if (!(start instanceof HTMLElement) || !start.isContentEditable)
    return undefined;
  let host = start;
  while (host.parentElement?.isContentEditable) host = host.parentElement;
  return host;
}

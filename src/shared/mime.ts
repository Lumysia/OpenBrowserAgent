// File types: which MIME type a file name stands for, and which types are
// text or HTML. One table for reading, saving and attaching files.

// By extension; the first extension listed for a type is the one a file of
// that type is saved with.
const TYPES: Record<string, string> = {
  txt: "text/plain",
  log: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  jsonl: "application/jsonl",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  svg: "image/svg+xml",
  css: "text/css",
  js: "text/javascript",
  ts: "text/plain",
  py: "text/x-python",
  sh: "text/x-shellscript",
  sql: "application/sql",
  yaml: "application/yaml",
  yml: "application/yaml",
  ics: "text/calendar",
  vcf: "text/vcard",
  srt: "application/x-subrip",
  vtt: "text/vtt",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const EXTENSIONS = Object.entries(TYPES).reduce<Record<string, string>>(
  (map, [extension, type]) => {
    map[type] ??= extension;
    return map;
  },
  {},
);

// Types outside text/* whose content is text.
const TEXT_APPLICATION_TYPES = new Set([
  "application/json",
  "application/jsonl",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/javascript",
  "application/sql",
  "application/x-subrip",
  "image/svg+xml",
]);

const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);

// "text/html; charset=utf-8" -> "text/html".
function baseType(type: string) {
  return type.split(";")[0].trim().toLowerCase();
}

export function extensionOf(name: string) {
  return name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || "";
}

export function typeForName(name: string) {
  return TYPES[extensionOf(name)] || "";
}

export function extensionForType(type: string) {
  const base = baseType(type);
  if (EXTENSIONS[base]) return EXTENSIONS[base];
  if (base.startsWith("text/")) return "txt";
  return "";
}

export function isHtmlType(type: string) {
  return HTML_TYPES.has(baseType(type));
}

// Text: text/*, the text application types, and structured suffixes
// (application/ld+json, application/rss+xml).
export function isTextType(type: string) {
  const base = baseType(type);
  return (
    base.startsWith("text/") ||
    TEXT_APPLICATION_TYPES.has(base) ||
    /\+(json|xml)$/.test(base)
  );
}

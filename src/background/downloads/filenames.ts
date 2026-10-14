// File names the browser accepts and that stay inside the Downloads folder.
// Browsers reject absolute paths, ".." and names Windows cannot hold, so
// they are made safe here instead of failing the download.

const SEGMENT_MAX_CHARS = 120;
const FALLBACK_NAME = "download";

// Control characters, characters Windows forbids, and bidirectional
// controls that can disguise an extension.
const UNSAFE_CHARS =
  /[\u0000-\u001f\u007f"*:<>?|\\\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]+/g;
const WINDOWS_DEVICE = /^(con|prn|aux|nul|clock\$|com\d|lpt\d)(\.|$)/i;
// Extensions the Windows shell runs instead of opening.
const SHELL_EXTENSION = /\.(lnk|local|scf|url)$/i;

const TYPES: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
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

// The extension for a MIME type: the first one listed for it.
const EXTENSIONS = Object.entries(TYPES).reduce<Record<string, string>>(
  (map, [extension, type]) => {
    map[type] ??= extension;
    return map;
  },
  {},
);

export function extensionOf(name: string) {
  return name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || "";
}

export function typeForName(name: string) {
  return TYPES[extensionOf(name)] || "";
}

export function extensionForType(type: string) {
  const base = type.split(";")[0].trim().toLowerCase();
  if (EXTENSIONS[base]) return EXTENSIONS[base];
  if (base.startsWith("text/")) return "txt";
  return "";
}

// One path segment: no separators, unsafe characters, leading or trailing
// dots and spaces, device names or shell extensions; at most
// SEGMENT_MAX_CHARS, keeping the extension.
export function safeSegment(value: string) {
  let name = value
    .normalize("NFC")
    .replace(UNSAFE_CHARS, "_")
    .replace(/\//g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  if (SHELL_EXTENSION.test(name)) name = name.replace(/\.(\w+)$/, "_$1");
  if (WINDOWS_DEVICE.test(name)) name = `_${name}`;
  if (name.length > SEGMENT_MAX_CHARS) {
    const extension = extensionOf(name);
    const keep = extension ? extension.length + 1 : 0;
    name = `${name.slice(0, SEGMENT_MAX_CHARS - keep).trimEnd()}${keep ? `.${extension}` : ""}`;
  }
  return name;
}

// A path relative to the Downloads folder: `folder` and any folders in
// `filename` become subfolders; "..", "." and absolute prefixes are dropped.
export function safeDownloadPath(filename: string, folder = "") {
  const segments = (value: string) =>
    value
      .trim()
      .replace(/^[a-z]:/i, "")
      .split(/[\\/]+/)
      .filter((segment) => segment.trim() !== "." && segment.trim() !== "..")
      .map(safeSegment)
      .filter(Boolean);
  const names = segments(filename);
  const name = /[\\/]\s*$/.test(filename) ? undefined : names.pop();
  return [...segments(folder), ...names, name || FALLBACK_NAME].join("/");
}

// A file name with an extension that fits `type` when it has none.
export function withExtension(name: string, type: string) {
  if (extensionOf(name)) return name;
  const extension = extensionForType(type);
  return extension ? `${name}.${extension}` : name;
}

// The file name a URL's path ends in, if any.
export function nameFromUrl(url: string) {
  try {
    const { pathname, protocol } = new URL(url);
    if (!/^(https?|ftp):$/.test(protocol)) return "";
    const last = pathname.split("/").filter(Boolean).pop() || "";
    return safeSegment(decodeURIComponent(last));
  } catch {
    return "";
  }
}

// The last segment of a path the browser reports (any platform).
export function baseName(path: string) {
  return path.split(/[\\/]/).pop() || "";
}

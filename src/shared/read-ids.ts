import { canonicalJson } from "./sync/codec";

// How reading names a stored list item. Normalizers read ids and paths with
// these, and saves (keepStoredForm) use the same ones to tell which stored
// item each item reading showed came from, so an item reading gave an id or
// whose path it normalized is still the same item.

// The stored id, else one made up from the item's place and content: two
// reads of the same data give the same ids.
export function readId(item: unknown, index: number) {
  const id = isRecord(item) ? item.id : undefined;
  return typeof id === "string" && id ? id : madeUpId(item, index);
}

function madeUpId(item: unknown, index: number) {
  return `read-${index}-${hashText(canonicalJson(item) ?? "")}`;
}

// A file path in one form: separators as "/", no empty segments.
export function readPath(value: unknown) {
  return (typeof value === "string" ? value : "")
    .trim()
    .replace(/\\+/g, "/")
    .split("/")
    .filter(Boolean)
    .join("/");
}

// The name reading gives the stored item at `index` of a list keyed by
// `field`; undefined when reading cannot name it.
export const READ_KEYS: Record<
  string,
  (item: unknown, index: number) => string | undefined
> = {
  id: readId,
  agentId: (item) =>
    isRecord(item) && typeof item.agentId === "string" && item.agentId
      ? item.agentId
      : undefined,
  path: (item) => (isRecord(item) && readPath(item.path)) || undefined,
};

// 53-bit FNV-style hash (cyrb53), as hex.
function hashText(text: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

import { sameJson } from "./sync/codec";

// A page's edit stored over a value another context changed since the page
// read it (a sync download, an agent tool): `edited` was made from `base`,
// `current` is what storage holds now. Each part takes the side that
// changed it, the edit's where both did; lists of items with ids merge
// item by item. Without this, a page writing its whole copy would undo
// changes it had not seen yet.
export function rebaseEdit<T>(base: T, edited: T, current: T): T {
  return merge(base, edited, current) as T;
}

type Item = Record<string, unknown>;

function merge(base: unknown, edited: unknown, current: unknown): unknown {
  if (sameJson(current, base)) return edited;
  if (sameJson(edited, base)) return current;
  if (isRecord(edited) && isRecord(current)) {
    const original = isRecord(base) ? base : {};
    const result: Item = {};
    for (const key of new Set([
      ...Object.keys(edited),
      ...Object.keys(current),
    ])) {
      const value = merge(original[key], edited[key], current[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if (isList(edited) && isList(current) && (base === undefined || isList(base)))
    return mergeList(base ?? [], edited, current);
  return edited;
}

// The edit's order; items added elsewhere follow. An item removed on one
// side stays removed unless the other side changed it.
function mergeList(base: Item[], edited: Item[], current: Item[]) {
  const originals = new Map(base.map((item) => [item.id, item]));
  const stored = new Map(current.map((item) => [item.id, item]));
  const editedIds = new Set(edited.map((item) => item.id));
  const result: unknown[] = [];
  for (const item of edited) {
    const original = originals.get(item.id);
    const now = stored.get(item.id);
    if (now) result.push(merge(original, item, now));
    else if (!original || !sameJson(item, original)) result.push(item);
  }
  for (const [id, now] of stored) {
    if (editedIds.has(id)) continue;
    const original = originals.get(id);
    if (!original || !sameJson(now, original)) result.push(now);
  }
  return result;
}

const isRecord = (value: unknown): value is Item =>
  !!value && typeof value === "object" && !Array.isArray(value);

// A list of objects with string ids (agents, servers, files).
const isList = (value: unknown): value is Item[] =>
  Array.isArray(value) &&
  value.every((item) => isRecord(item) && typeof item.id === "string");

type EditableItem<T> = {
  set(value: T): Promise<unknown>;
  update?(updater: (current: T) => T): Promise<unknown>;
};

// Store a page's edit made from `base`, keeping what changed meanwhile.
export function storeEdit<T>(item: EditableItem<T>, base: T, edited: T) {
  return item.update
    ? item.update((current) => rebaseEdit(base, edited, current))
    : item.set(edited);
}

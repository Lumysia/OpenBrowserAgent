import { sameJson } from "./sync/codec";

// What to store for `next`, a change made from `shown` (what reading
// `stored` gave: defaults filled in, migrated, sorted). Every part the change
// left as `shown` had it keeps its stored form, so normalizing on read is
// never written back: a write that changed nothing stores `stored` itself,
// and one that changed a single list item leaves the others as they were.
// Otherwise sync would count those rewrites as edits made here, which bring
// back items deleted on another device and spread an older app version's
// form of the data. List items match by id.
export function keepStoredForm<T>(stored: unknown, shown: T, next: T): T {
  // Never stored: a list read as items filled in on read goes on below
  // (stored as no items); any other value is stored as the change made it.
  if (stored === undefined && !Array.isArray(shown)) return next;
  if (sameJson(shown, next)) return (stored ?? next) as T;
  if (isRecord(stored) && isRecord(shown) && isRecord(next))
    return keepFields(stored, shown, next) as T;
  if (Array.isArray(shown) && Array.isArray(next))
    if (stored === undefined || Array.isArray(stored))
      return keepItems(stored ?? [], shown, next) as T;
  return next;
}

type Fields = Record<string, unknown>;

function keepFields(stored: Fields, shown: Fields, next: Fields) {
  const result: Fields = {};
  for (const [key, value] of Object.entries(next)) {
    if (!(key in shown)) result[key] = value;
    else if (!(key in stored)) {
      // Filled in on read and left alone: still not stored.
      if (sameJson(shown[key], value)) continue;
      result[key] = keepStoredForm(undefined, shown[key], value);
    } else result[key] = keepStoredForm(stored[key], shown[key], value);
  }
  // Dropped on read (a field a newer version added): the change never saw it.
  for (const key of Object.keys(stored))
    if (!(key in shown) && !(key in next)) result[key] = stored[key];
  return result;
}

const ID_FIELDS = ["id", "agentId", "path"];

// The same rules item by item: an item filled in on read (a built-in MCP
// server or agent) that the change left alone is not stored, and an item
// dropped on read (a kind a newer version added) stays. Where the change
// reordered the items it was shown, the order is its edit: every item it
// holds is stored.
function keepItems(stored: unknown[], shown: unknown[], next: unknown[]) {
  const field = ID_FIELDS.find(
    (name) =>
      shown.length > 0 &&
      shown.every((item) => isRecord(item) && typeof item[name] === "string"),
  );
  if (!field) return next;
  const idOf = (item: unknown) =>
    isRecord(item) && typeof item[field] === "string"
      ? (item[field] as string)
      : undefined;
  const storedIds = new Set(stored.map(idOf));
  const shownIds = new Set(shown.map(idOf));
  const nextIds = new Set(next.map(idOf));
  const storedById = uniqueById(stored, idOf);
  const shownById = uniqueById(shown, idOf);
  const order = (list: unknown[], ids: Set<string | undefined>) =>
    list.map(idOf).filter((id) => id !== undefined && ids.has(id));
  const reordered = !sameJson(order(next, shownIds), order(shown, nextIds));
  const result: unknown[] = [];
  for (const item of next) {
    const id = idOf(item);
    const before = id === undefined ? undefined : shownById.get(id);
    if (id === undefined || before === undefined) result.push(item);
    else if (!storedIds.has(id)) {
      if (reordered || !sameJson(before, item)) result.push(item);
    } else if (storedById.has(id))
      result.push(keepStoredForm(storedById.get(id), before, item));
    else result.push(item);
  }
  // Each dropped item goes after the stored item it followed.
  let index = 0;
  for (const item of stored) {
    const id = idOf(item);
    if (id === undefined) continue;
    if (!shownIds.has(id) && !nextIds.has(id)) result.splice(index++, 0, item);
    else {
      const at = result.findIndex((kept) => idOf(kept) === id);
      if (at >= 0) index = at + 1;
    }
  }
  return result;
}

// Items by id; an id held twice (merged on read) has no single stored form.
function uniqueById(
  items: unknown[],
  idOf: (item: unknown) => string | undefined,
) {
  const byId = new Map<string, unknown>();
  const repeated = new Set<string>();
  for (const item of items) {
    const id = idOf(item);
    if (id === undefined) continue;
    if (byId.has(id)) repeated.add(id);
    byId.set(id, item);
  }
  for (const id of repeated) byId.delete(id);
  return byId;
}

const isRecord = (value: unknown): value is Fields =>
  !!value && typeof value === "object" && !Array.isArray(value);

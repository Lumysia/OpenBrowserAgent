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
  if (stored === undefined) return next;
  if (sameJson(shown, next)) return stored as T;
  if (isRecord(stored) && isRecord(shown) && isRecord(next))
    return keepFields(stored, shown, next) as T;
  if (Array.isArray(stored) && Array.isArray(shown) && Array.isArray(next))
    return keepItems(stored, shown, next) as T;
  return next;
}

type Fields = Record<string, unknown>;

function keepFields(stored: Fields, shown: Fields, next: Fields) {
  const result: Fields = {};
  for (const [key, value] of Object.entries(next)) {
    if (!(key in shown) || !(key in stored)) {
      // Filled in on read and left alone: still not stored.
      if (key in shown && sameJson(shown[key], value)) continue;
      result[key] = value;
    } else result[key] = keepStoredForm(stored[key], shown[key], value);
  }
  // Dropped on read (a field a newer version added): the change never saw it.
  for (const key of Object.keys(stored))
    if (!(key in shown) && !(key in next)) result[key] = stored[key];
  return result;
}

const ID_FIELDS = ["id", "agentId", "path"];

function keepItems(stored: unknown[], shown: unknown[], next: unknown[]) {
  const field = ID_FIELDS.find(
    (name) =>
      shown.length > 0 &&
      shown.every((item) => isRecord(item) && typeof item[name] === "string"),
  );
  if (!field) return next;
  const storedById = uniqueById(stored, field);
  const shownById = uniqueById(shown, field);
  return next.map((item) => {
    const id = isRecord(item) ? item[field] : undefined;
    if (typeof id !== "string" || !storedById.has(id) || !shownById.has(id))
      return item;
    return keepStoredForm(storedById.get(id), shownById.get(id), item);
  });
}

// Items by id; an id held twice (merged on read) has no single stored form.
function uniqueById(items: unknown[], field: string) {
  const byId = new Map<string, unknown>();
  const repeated = new Set<string>();
  for (const item of items) {
    const id = isRecord(item) ? item[field] : undefined;
    if (typeof id !== "string") continue;
    if (byId.has(id)) repeated.add(id);
    byId.set(id, item);
  }
  for (const id of repeated) byId.delete(id);
  return byId;
}

const isRecord = (value: unknown): value is Fields =>
  !!value && typeof value === "object" && !Array.isArray(value);

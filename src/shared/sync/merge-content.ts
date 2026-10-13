import { sameJson } from "./codec";

// Merges of content both devices changed since they last agreed (`base`,
// absent when it is unknown). Nothing one side added is lost.

type Keyed = Record<string, unknown>;

type Side = "mine" | "theirs";

// Two values both changed from `base`: each part takes the side that
// changed it, `preferred`'s where both changed the same value. Objects merge
// key by key and lists of items with ids item by item, so edits of
// different keys, items or nested fields all stay. Page saves (the page's
// edit preferred) and records two devices changed (the newer preferred)
// merge alike.
export function mergeChanges<T>(base: unknown, preferred: T, other: T): T {
  return mergeValues(base, preferred, other) as T;
}

function mergeValues(base: unknown, preferred: unknown, other: unknown) {
  if (sameJson(other, base)) return preferred;
  if (sameJson(preferred, base)) return other;
  if (isRecord(preferred) && isRecord(other)) {
    const original = isRecord(base) ? base : {};
    const result: Keyed = {};
    for (const key of new Set([
      ...Object.keys(preferred),
      ...Object.keys(other),
    ])) {
      const value = mergeValues(original[key], preferred[key], other[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if (
    isList(preferred) &&
    isList(other) &&
    (base === undefined || isList(base))
  )
    return mergeList(base ?? [], preferred, other);
  return preferred;
}

// `preferred`'s order; items only the other side added follow. An item
// removed on one side stays removed unless the other side changed it.
function mergeList(base: Keyed[], preferred: Keyed[], other: Keyed[]) {
  const originals = new Map(base.map((item) => [item.id, item]));
  const others = new Map(other.map((item) => [item.id, item]));
  const preferredIds = new Set(preferred.map((item) => item.id));
  const result: unknown[] = [];
  for (const item of preferred) {
    const original = originals.get(item.id);
    const otherItem = others.get(item.id);
    if (otherItem) result.push(mergeValues(original, item, otherItem));
    else if (!original || !sameJson(item, original)) result.push(item);
  }
  for (const [id, item] of others) {
    if (preferredIds.has(id)) continue;
    const original = originals.get(id);
    if (!original || !sameJson(item, original)) result.push(item);
  }
  return result;
}

const isRecord = (value: unknown): value is Keyed =>
  !!value && typeof value === "object" && !Array.isArray(value);

// A list of objects with string ids (agents, servers, models).
const isList = (value: unknown): value is Keyed[] =>
  Array.isArray(value) &&
  value.every((item) => isRecord(item) && typeof item.id === "string");

// Three-way merge of keyed entries. An entry changed on one side takes that
// change; changed on both, the newer side's copy wins and `onLoser` sees the
// other. Removed on one side and unchanged on the other: removed. Without a
// base every entry either side has is kept.
export function mergeKeyed<T extends Keyed>(
  key: (entry: T) => string,
  base: T[] | undefined,
  mine: T[],
  theirs: T[],
  newer: Side,
  onLoser?: (loser: T, winner: T) => void,
) {
  const baseMap = new Map(base?.map((entry) => [key(entry), entry]));
  const mineMap = new Map(mine.map((entry) => [key(entry), entry]));
  const theirsMap = new Map(theirs.map((entry) => [key(entry), entry]));
  const result = new Map<string, T>();
  for (const id of new Set([...mineMap.keys(), ...theirsMap.keys()])) {
    const original = baseMap.get(id);
    const mineEntry = mineMap.get(id);
    const theirsEntry = theirsMap.get(id);
    const mineChanged =
      !original || !mineEntry || !sameJson(mineEntry, original);
    const theirsChanged =
      !original || !theirsEntry || !sameJson(theirsEntry, original);
    if (!mineEntry || !theirsEntry) {
      const present = (mineEntry ?? theirsEntry)!;
      // Removed on the other side: stays removed unless changed here since.
      if (original && sameJson(present, original)) continue;
      result.set(id, present);
      continue;
    }
    if (sameJson(mineEntry, theirsEntry) || !theirsChanged) {
      result.set(id, mineEntry);
      continue;
    }
    if (!mineChanged) {
      result.set(id, theirsEntry);
      continue;
    }
    const [winner, loser] =
      newer === "mine" ? [mineEntry, theirsEntry] : [theirsEntry, mineEntry];
    result.set(id, winner);
    onLoser?.(loser, winner);
  }
  return result;
}

// Order of a merge: the newer side's order, with entries only the other side
// has placed after the last entry that is not later than them.
export function orderMerged<T extends Keyed>(
  key: (entry: T) => string,
  merged: Map<string, T>,
  primary: T[],
  secondary: T[],
  time: (entry: T) => number,
) {
  const ordered: T[] = [];
  for (const entry of primary) {
    const value = merged.get(key(entry));
    if (value) ordered.push(value);
  }
  const placed = new Set(ordered.map(key));
  for (const id of [...secondary.map(key), ...merged.keys()]) {
    const value = merged.get(id);
    if (!value || placed.has(id)) continue;
    let index = ordered.length;
    while (index > 0 && time(ordered[index - 1]) > time(value)) index--;
    ordered.splice(index, 0, value);
    placed.add(id);
  }
  return ordered;
}

type ChatBody = {
  messages: Keyed[];
  sources?: Keyed[];
  imageGenerationJobs?: Keyed[];
};

const byId = (entry: Keyed) => String(entry.id);
const createdAt = (entry: Keyed) =>
  typeof entry.createdAt === "number" ? entry.createdAt : 0;

// Chats both devices changed: messages, sources and image jobs are merged by
// id, so messages added on either device all stay.
export function mergeChatBodies(
  base: ChatBody | undefined,
  mine: ChatBody,
  theirs: ChatBody,
  newer: Side,
): ChatBody {
  const field = (name: keyof ChatBody) => {
    const mineList = mine[name] ?? [];
    const theirsList = theirs[name] ?? [];
    const merged = mergeKeyed(byId, base?.[name], mineList, theirsList, newer);
    const [primary, secondary] =
      newer === "mine" ? [mineList, theirsList] : [theirsList, mineList];
    return orderMerged(byId, merged, primary, secondary, createdAt);
  };
  const sources = field("sources");
  const imageGenerationJobs = field("imageGenerationJobs");
  return {
    messages: field("messages"),
    ...(sources.length ? { sources } : {}),
    ...(imageGenerationJobs.length ? { imageGenerationJobs } : {}),
  };
}

type FileEntry = Keyed & { path: string };

// Skill or workspace files both devices edited: the newer edit keeps the
// path and the other is kept beside it as a conflict copy.
export function mergeFiles<T extends FileEntry>(
  base: T[] | undefined,
  mine: T[],
  theirs: T[],
  newer: Side,
  conflictLabel: string,
): T[] {
  const copies: T[] = [];
  const merged = mergeKeyed(
    (entry: T) => entry.path,
    base,
    mine,
    theirs,
    newer,
    (loser) => copies.push(loser),
  );
  const [primary, secondary] =
    newer === "mine" ? [mine, theirs] : [theirs, mine];
  const ordered = orderMerged(
    (entry: T) => entry.path,
    merged,
    primary,
    secondary,
    () => 0,
  );
  const taken = new Set(ordered.map((entry) => entry.path));
  for (const copy of copies) {
    const path = conflictCopyPath(copy.path, conflictLabel, taken);
    taken.add(path);
    ordered.push({ ...copy, path });
  }
  return ordered;
}

export function conflictCopyPath(
  path: string,
  label: string,
  taken: ReadonlySet<string>,
) {
  const slash = path.lastIndexOf("/") + 1;
  const name = path.slice(slash);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let attempt = 1; ; attempt++) {
    const suffix = attempt === 1 ? label : `${label}-${attempt}`;
    const candidate = `${path.slice(0, slash)}${stem}.conflict-${suffix}${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

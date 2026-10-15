import { isRecord } from "../values";
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

// `preferred`'s order, unless only the other side reordered the items all
// three hold; items only one side has follow. An item removed on one side
// stays removed unless the other side changed it.
function mergeList(base: Keyed[], preferred: Keyed[], other: Keyed[]) {
  const originals = new Map(base.map((item) => [item.id, item]));
  const preferreds = new Map(preferred.map((item) => [item.id, item]));
  const others = new Map(other.map((item) => [item.id, item]));
  const order = (list: Keyed[]) =>
    list
      .map((item) => item.id)
      .filter(
        (id) => originals.has(id) && preferreds.has(id) && others.has(id),
      );
  const otherReordered =
    sameJson(order(preferred), order(base)) &&
    !sameJson(order(other), order(base));
  const result: unknown[] = [];
  const placed = new Set<unknown>();
  for (const item of otherReordered
    ? [...other, ...preferred]
    : [...preferred, ...other]) {
    if (placed.has(item.id)) continue;
    placed.add(item.id);
    const original = originals.get(item.id);
    const mine = preferreds.get(item.id);
    const theirs = others.get(item.id);
    if (mine && theirs) result.push(mergeValues(original, mine, theirs));
    else if (!original || !sameJson(item, original)) result.push(item);
  }
  return result;
}

// A list of objects with string ids (agents, servers, models).
const isList = (value: unknown): value is Keyed[] =>
  Array.isArray(value) &&
  value.every((item) => isRecord(item) && typeof item.id === "string");

// Three-way merge of keyed entries. An entry changed on one side takes that
// change; changed on both, the newer side's copy wins and `onLoser` sees the
// other. Removed on one side and unchanged on the other: removed. Without a
// base every entry either side has is kept. `same`: entries that hold the
// same value (equal ones are unchanged, and never conflict).
function mergeKeyed<T extends Keyed>(
  key: (entry: T) => string,
  base: T[] | undefined,
  mine: T[],
  theirs: T[],
  newer: Side,
  onLoser?: (loser: T, winner: T) => void,
  same: (left: T, right: T) => boolean = sameJson,
) {
  const baseMap = new Map(base?.map((entry) => [key(entry), entry]));
  const mineMap = new Map(mine.map((entry) => [key(entry), entry]));
  const theirsMap = new Map(theirs.map((entry) => [key(entry), entry]));
  const result = new Map<string, T>();
  for (const id of new Set([...mineMap.keys(), ...theirsMap.keys()])) {
    const original = baseMap.get(id);
    const mineEntry = mineMap.get(id);
    const theirsEntry = theirsMap.get(id);
    const mineChanged = !original || !mineEntry || !same(mineEntry, original);
    const theirsChanged =
      !original || !theirsEntry || !same(theirsEntry, original);
    if (!mineEntry || !theirsEntry) {
      const present = (mineEntry ?? theirsEntry)!;
      // Removed on the other side: stays removed unless changed here since.
      if (original && same(present, original)) continue;
      result.set(id, present);
      continue;
    }
    const [newerEntry, olderEntry] =
      newer === "mine" ? [mineEntry, theirsEntry] : [theirsEntry, mineEntry];
    if (same(mineEntry, theirsEntry)) result.set(id, newerEntry);
    else if (!theirsChanged) result.set(id, mineEntry);
    else if (!mineChanged) result.set(id, theirsEntry);
    else {
      result.set(id, newerEntry);
      onLoser?.(olderEntry, newerEntry);
    }
  }
  return result;
}

// Order of a merge: the newer side's order, with entries only the other side
// has placed after the last entry that is not later than them.
function orderMerged<T extends Keyed>(
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
// path and the other is kept beside it as a conflict copy. Files are equal
// when all but their edit time is: saving the same text again, or creating
// the same default file, changes nothing.
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
    sameFile,
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

// The base of a merge of files that never had one, from the files any
// device starts with (never edited: time 0): an untouched default file then
// never replaces an edit. Not where the side holding the default text made
// the newer edit of that file: it set the file back, and that is an edit too.
export function defaultsBase<T extends FileEntry>(
  defaults: T[],
  mine: T[],
  theirs: T[],
) {
  const time = (entry: FileEntry) =>
    typeof entry.updatedAt === "number" ? entry.updatedAt : 0;
  return defaults.filter((file) => {
    const mineFile = mine.find((entry) => entry.path === file.path);
    const theirsFile = theirs.find((entry) => entry.path === file.path);
    if (!mineFile || !theirsFile) return true;
    const mineDefault = sameFile(mineFile, file);
    if (mineDefault === sameFile(theirsFile, file)) return true;
    const [reset, other] = mineDefault
      ? [mineFile, theirsFile]
      : [theirsFile, mineFile];
    return time(reset) <= time(other);
  });
}

const sameFile = (left: FileEntry, right: FileEntry) =>
  sameJson({ ...left, updatedAt: 0 }, { ...right, updatedAt: 0 });

function conflictCopyPath(
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

import { storageLockName } from "../locks";
import {
  applyVerified,
  listEntries,
  orderItems,
  ORDER_ID,
  writeHooks,
  type Change,
  type Collection,
  type LocalEntry,
} from "./collection";
import { readKey, type SyncEnv } from "./env";
import { defaultsBase, mergeFiles } from "./merge-content";

// Collections stored under one storage key. An item can be split into
// parts that sync as separate collections (a provider's settings and its
// API key, a skill and its files), each with its own group.

type Item = Record<string, unknown>;
type FileItem = Item & { path: string };

export const isRecord = (value: unknown): value is Item =>
  !!value && typeof value === "object" && !Array.isArray(value);

// One part of each stored item. The owner part holds what makes an item
// exist: it creates and deletes items. Any other part only changes the
// items there are, and has no record for an item that holds none of it, so
// a device without that content never uploads an empty part.
export type ItemPart = {
  owner: boolean;
  // The part's record of an item; undefined: the item holds none of it.
  split(item: Item): LocalEntry | undefined;
  // The item without this part (what the other parts hold).
  rest(item: Item): Item;
  join(rest: Item, entry: LocalEntry): Item;
};

const WHOLE: ItemPart = {
  owner: true,
  split: (item) => ({ data: item }),
  rest: () => ({}),
  join: (_rest, entry) => entry.data as Item,
};

const pick = (item: Item, fields: string[], keep: boolean) =>
  Object.fromEntries(
    Object.entries(item).filter(([field]) => fields.includes(field) === keep),
  );

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (typeof value === "object" && !Object.keys(value).length);

// The item without `fields` (owner), or just `fields` (a part with no
// record while they are all empty: an API key nobody entered).
export function fieldsPart(fields: string[], owner: boolean): ItemPart {
  return owner
    ? {
        owner,
        split: (item) => ({ data: pick(item, fields, false) }),
        rest: (item) => pick(item, fields, true),
        join: (rest, entry) => ({ ...(entry.data as Item), ...rest }),
      }
    : {
        owner,
        split(item) {
          const data = pick(item, fields, true);
          return Object.values(data).every(isEmpty) ? undefined : { data };
        },
        rest: (item) => pick(item, fields, false),
        join: (rest, entry) => ({ ...rest, ...(entry.data as Item) }),
      };
}

// The item's files matching `owns` as the body. The owner part's data is
// the item without its files; another part has no data of its own.
export function filesPart(
  field: string,
  owns: (path: string) => boolean,
  owner: boolean,
): ItemPart {
  const filesOf = (item: Item) =>
    (Array.isArray(item[field]) ? (item[field] as unknown[]) : []).filter(
      isRecord,
    ) as FileItem[];
  const mine = (file: FileItem) => owns(String(file.path));
  return {
    owner,
    split(item) {
      const body = filesOf(item).filter(mine);
      if (owner) return { data: pick(item, [field], false), body };
      return body.length ? { data: {}, body } : undefined;
    },
    rest(item) {
      const others = filesOf(item).filter((file) => !mine(file));
      return owner ? { [field]: others } : { ...item, [field]: others };
    },
    join(rest, entry) {
      const body = Array.isArray(entry.body) ? entry.body : [];
      if (owner)
        return {
          ...(entry.data as Item),
          [field]: [...body, ...((rest[field] as unknown[]) ?? [])],
        };
      return { ...rest, [field]: [...filesOf(rest), ...body] };
    },
  };
}

type StoredOptions = {
  name: string;
  groups?: Collection["groups"];
  largeContent?: true;
  encrypted?: true;
  partOf?: string;
  key: string;
  body?: "json";
  ordered?: boolean;
  mergeBodies?: Collection["mergeBodies"];
  // Values the app uses while a field was never stored.
  defaults?: Record<string, unknown>;
};

// One stored value holding the whole collection. `fromEntries` gets the
// stored value the entries replace (other parts of its items).
export function storedCollection(
  options: StoredOptions & {
    toEntries(value: unknown): Map<string, LocalEntry>;
    fromEntries(entries: Map<string, LocalEntry>, previous: unknown): unknown;
    // Whether a change can be stored (a part needs its item).
    accepts?(previous: unknown, change: Change): boolean;
  },
): Collection {
  const { key, toEntries, fromEntries, accepts, defaults } = options;
  return {
    name: options.name,
    groups: options.groups ?? [],
    largeContent: options.largeContent,
    encrypted: options.encrypted,
    partOf: options.partOf,
    keys: [key],
    body: options.body,
    ordered: options.ordered,
    mergeBodies: options.mergeBodies,
    defaultData: defaults && ((id) => defaults[id]),
    async read(env) {
      return toEntries(await readKey(env.local, key));
    },
    entriesOf: (_key, value) => ({ entries: toEntries(value), complete: true }),
    write(env: SyncEnv, changes: Change[], hooks) {
      const { verify, commit, step } = writeHooks(env, hooks);
      return env.lock(storageLockName(key), () =>
        step(async () => {
          const previous = await readKey(env.local, key);
          const entries = toEntries(previous);
          const written = await applyVerified(
            entries,
            accepts
              ? changes.filter((change) => accepts(previous, change))
              : changes,
            verify,
          );
          if (written.size)
            await commit({ [key]: fromEntries(entries, previous) }, written);
          return written;
        }),
      );
    },
  };
}

// A record per key of a stored object (`part`: which fields of each value).
export function recordMap(
  options: StoredOptions & { part?: ItemPart },
): Collection {
  const { part } = options;
  const valuesOf = (value: unknown) =>
    new Map(
      Object.entries(isRecord(value) ? value : {}).filter(
        ([, entry]) => entry !== undefined,
      ),
    );
  if (!part)
    return storedCollection({
      ...options,
      toEntries: (value) =>
        new Map([...valuesOf(value)].map(([id, data]) => [id, { data }])),
      fromEntries: (entries) =>
        Object.fromEntries([...entries].map(([id, entry]) => [id, entry.data])),
    });
  const itemOf = (value: unknown): Item => (isRecord(value) ? value : {});
  return storedCollection({
    ...options,
    toEntries(value) {
      const entries = new Map<string, LocalEntry>();
      for (const [id, data] of valuesOf(value)) {
        const entry = part.split(itemOf(data));
        if (entry) entries.set(id, entry);
      }
      return entries;
    },
    fromEntries(entries, previous) {
      const stored = valuesOf(previous);
      const result: Item = {};
      for (const id of part.owner ? entries.keys() : stored.keys()) {
        const entry = entries.get(id);
        const rest = part.rest(itemOf(stored.get(id)));
        result[id] = entry ? part.join(rest, entry) : rest;
      }
      return result;
    },
    accepts: part.owner
      ? undefined
      : (previous, change) =>
          !change.entry || valuesOf(previous).has(change.id),
  });
}

const createdAt = (item: Item) =>
  typeof item.createdAt === "number" ? item.createdAt : 0;

// A list of items keyed by `idField`. `newBody`: the body any device gives
// an item it creates without user input, the base of a merge where the
// devices never agreed on one (so untouched defaults count as unchanged;
// see defaultsBase).
export function list(
  options: StoredOptions & {
    idField?: string;
    part?: ItemPart;
    newBody?: () => unknown[];
  },
): Collection {
  const { idField = "id", newBody } = options;
  const part = options.part ?? WHOLE;
  const ordered = part.owner && (options.ordered ?? true);
  const itemsOf = (value: unknown) =>
    (Array.isArray(value) ? value : []).filter(isRecord);
  const idOf = (item: Item) =>
    typeof item[idField] === "string" ? (item[idField] as string) : "";
  return storedCollection({
    ...options,
    ordered,
    toEntries(value) {
      return listEntries(
        itemsOf(value).filter((item) => part.split(item)),
        idField,
        (item) => part.split(item)!,
        ordered,
      );
    },
    fromEntries(entries, previous) {
      const stored = new Map(
        itemsOf(previous).map((item) => [idOf(item), item]),
      );
      if (!part.owner)
        return itemsOf(previous).map((item) => {
          const entry = entries.get(idOf(item));
          const rest = part.rest(item);
          return entry ? part.join(rest, entry) : rest;
        });
      const items = new Map<string, Item>();
      for (const [id, entry] of entries)
        if (id !== ORDER_ID && isRecord(entry.data))
          items.set(id, part.join(part.rest(stored.get(id) ?? {}), entry));
      return orderItems(items, entries.get(ORDER_ID)?.data, createdAt);
    },
    accepts: part.owner
      ? undefined
      : (previous, change) =>
          !change.entry ||
          itemsOf(previous).some((item) => idOf(item) === change.id),
    mergeBodies: options.body
      ? (base, mine, theirs, newer, label) =>
          mergeFiles(
            Array.isArray(base)
              ? (base as FileItem[])
              : newBody &&
                  defaultsBase(
                    newBody() as FileItem[],
                    mine as FileItem[],
                    theirs as FileItem[],
                  ),
            mine as FileItem[],
            theirs as FileItem[],
            newer,
            label,
          )
      : undefined,
  });
}

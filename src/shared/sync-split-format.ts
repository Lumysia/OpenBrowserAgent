import { getBrowserApi } from "./browser-api";
import { isChatRunActive } from "./chats";
import { STORAGE_KEYS } from "./storage-keys";
import {
  itemsFromTable,
  setOrderedTable,
  type SyncDocCodec,
} from "./sync-tinybase-doc";
import type { ChatSummary } from "./types";

// Document format of split collections (see sync-split): the index codec,
// the per-item content codec, content revs and hashes.

export type SplitCollection = {
  key: string;
  idField: string;
  // Content fields: arrays of items stored one row per item, keyed by the
  // given field, so concurrent edits of different entries merge.
  body: Record<string, string>;
  // Content fields left out of an item while empty.
  omitEmpty?: string[];
  // Stored as a list plus one content entry per item, locally too; content
  // is read per item on demand (see storage-split).
  lazy?: boolean;
  // Content that must not upload yet; it stays pending.
  hold?: (item: Item) => boolean;
};

export type Item = Record<string, unknown>;

// A collection whose items carry large content. Its cloud form is a small
// index document (each item's other fields plus the revs of its content) and
// one content document per item, so a change uploads and downloads only the
// items it touched.
const SPLIT_COLLECTIONS: SplitCollection[] = [
  {
    key: STORAGE_KEYS.chats,
    idField: "id",
    body: { messages: "id", sources: "id", imageGenerationJobs: "id" },
    omitEmpty: ["sources", "imageGenerationJobs"],
    lazy: true,
    // A streaming reply uploads once it has finished.
    hold: (item) => isChatRunActive(item as ChatSummary),
  },
  { key: STORAGE_KEYS.skills, idField: "id", body: { files: "path" } },
  {
    key: STORAGE_KEYS.agentWorkspaces,
    idField: "agentId",
    body: { files: "path" },
  },
];

export function splitCollection(key: string) {
  return SPLIT_COLLECTIONS.find((collection) => collection.key === key);
}
export type Body = Record<string, unknown[]>;
// An item's content rev: each device writes only its own cell (the rev of the
// content document it stored), so concurrent writers never overwrite each
// other's rev and a reader sees a change whenever any cell changes.
export type Revs = Record<string, string>;
export type Index = { items: Item[]; revs: Record<string, Revs> };

const ITEMS_TABLE = "items";
const REVS_TABLE = "revs";
const ITEM_CONCURRENCY = 4;

// `revs` sets only the given cells; the others keep theirs.
export function indexCodec(collection: SplitCollection): SyncDocCodec<Index> {
  return {
    set(store, { items, revs }, keepUnseen) {
      store.transaction(() => {
        setOrderedTable(
          store,
          ITEMS_TABLE,
          items,
          collection.idField,
          keepUnseen,
        );
        for (const [id, row] of Object.entries(revs))
          for (const [device, rev] of Object.entries(row))
            store.setCell(REVS_TABLE, id, device, rev);
        for (const id of store.getRowIds(REVS_TABLE))
          if (!store.hasRow(ITEMS_TABLE, id)) store.delRow(REVS_TABLE, id);
      });
    },
    get(store) {
      return {
        items: itemsFromTable(store.getTable(ITEMS_TABLE), collection.idField),
        revs: Object.fromEntries(
          Object.entries(store.getTable(REVS_TABLE)).map(([id, row]) => [
            id,
            Object.fromEntries(
              Object.entries(row).map(([device, rev]) => [device, String(rev)]),
            ),
          ]),
        ),
      };
    },
  };
}

export function bodyCodec(collection: SplitCollection): SyncDocCodec<Body> {
  const fields = Object.entries(collection.body);
  return {
    set(store, body, keepUnseen) {
      store.transaction(() => {
        for (const [field, keyField] of fields)
          setOrderedTable(store, field, body[field], keyField, keepUnseen);
      });
    },
    get(store) {
      return Object.fromEntries(
        fields.map(([field, keyField]) => [
          field,
          itemsFromTable(store.getTable(field), keyField),
        ]),
      );
    },
  };
}

// Stable per-device identity for rev cells.
export async function syncDeviceId() {
  const storageKey = STORAGE_KEYS.syncDeviceId;
  const local = getBrowserApi().storage.local;
  const stored = (await local.get(storageKey))[storageKey];
  if (typeof stored === "string" && stored) return stored;
  const id = crypto.randomUUID();
  await local.set({ [storageKey]: id });
  return id;
}

export function sameRevs(left: Revs, right: Revs) {
  return revKey(left) === revKey(right);
}

export function revKey(revs: Revs) {
  return JSON.stringify(
    Object.entries(revs).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

export async function mapLimit<T, R>(items: T[], run: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(ITEM_CONCURRENCY, items.length) }, worker),
  );
  return results;
}

export function hashBody(body: Body | undefined) {
  return hashString(canonicalJson(body ?? {}));
}

// Key order differs between an app value and a decoded document.
function canonicalJson(value: unknown) {
  return JSON.stringify(value, (_key, child: unknown) =>
    child && typeof child === "object" && !Array.isArray(child)
      ? Object.fromEntries(
          Object.entries(child).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : child,
  );
}

// 53-bit string hash (cyrb53); detects changes, not adversarial collisions.
function hashString(text: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

import { getBrowserApi } from "./browser-api";
import { STORAGE_KEYS } from "./storage-keys";
import {
  documentScope,
  readDocument,
  readLocalDocument,
  removeDocument,
  writeDocument,
  type DocumentTransport,
} from "./sync-documents";
import {
  hasStringKey,
  itemsFromTable,
  removeLocalTinyBaseSyncDocument,
  setOrderedTable,
  tinybaseSyncLocalCacheKey,
  type SyncDocCodec,
} from "./sync-tinybase-doc";

// A collection whose items carry large content. Its cloud form is a small
// index document (each item's other fields plus the rev of its content) and
// one content document per item, so a change uploads and downloads only the
// items it touched.
type SplitCollection = {
  key: string;
  idField: string;
  // Content fields: arrays of items stored one row per item, keyed by the
  // given field, so concurrent edits of different entries merge.
  body: Record<string, string>;
  // Content fields left out of an item while empty.
  omitEmpty?: string[];
};

const SPLIT_COLLECTIONS: SplitCollection[] = [
  {
    key: STORAGE_KEYS.chats,
    idField: "id",
    body: { messages: "id", sources: "id", imageGenerationJobs: "id" },
    omitEmpty: ["sources", "imageGenerationJobs"],
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

type Item = Record<string, unknown>;
type Body = Record<string, unknown[]>;
type Index = { items: Item[]; revs: Record<string, string> };
// What this device last synced per item: the index rev and a hash of the
// content, so unchanged items are neither uploaded nor downloaded.
type SyncedItems = Record<string, { rev: string; body: string }>;

const ITEMS_TABLE = "items";
const REVS_TABLE = "revs";
const REV_CELL = "rev";
const ITEM_CONCURRENCY = 4;
const MAX_REV_FIXES = 3;

// `revs` sets only the given items' revs; the others keep theirs.
function indexCodec(collection: SplitCollection): SyncDocCodec<Index> {
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
        for (const [id, rev] of Object.entries(revs))
          store.setCell(REVS_TABLE, id, REV_CELL, rev);
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
            String(row[REV_CELL] ?? ""),
          ]),
        ),
      };
    },
  };
}

function bodyCodec(collection: SplitCollection): SyncDocCodec<Body> {
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

export function createSplitCollectionStore(
  transport: DocumentTransport,
  collection: SplitCollection,
) {
  const { key, idField } = collection;
  const index = indexCodec(collection);
  const bodies = bodyCodec(collection);
  const itemName = (id: string) => `${key}/${encodeURIComponent(id)}`;
  const stateKey = tinybaseSyncLocalCacheKey(
    `${documentScope(transport.config, key)}#items`,
  );
  const idOf = (item: Item) => item[idField] as string;

  function split(item: Item) {
    const meta: Item = {};
    const body: Body = {};
    for (const [field, value] of Object.entries(item))
      if (!(field in collection.body)) meta[field] = value;
    for (const [field, keyField] of Object.entries(collection.body)) {
      const value = item[field];
      body[field] = Array.isArray(value)
        ? value.filter((entry) => hasStringKey(entry, keyField))
        : [];
    }
    return { meta, body };
  }

  function join(meta: Item, body: Body | undefined) {
    const item = { ...meta };
    for (const field of Object.keys(collection.body)) {
      const value = body?.[field] ?? [];
      if (value.length || !collection.omitEmpty?.includes(field))
        item[field] = value;
    }
    return item;
  }

  async function readState() {
    return ((await getBrowserApi().storage.local.get(stateKey))[stateKey] ||
      {}) as SyncedItems;
  }

  async function writeState(state: SyncedItems) {
    await getBrowserApi().storage.local.set({ [stateKey]: state });
  }

  async function forget(id: string, removeRemote: boolean) {
    if (removeRemote) await removeDocument(transport, itemName(id));
    else
      await removeLocalTinyBaseSyncDocument(
        documentScope(transport.config, itemName(id)),
      );
  }

  // Bring every indexed item up to date, fetching only content whose rev
  // changed. `known` holds content this operation already has.
  async function reconcile(
    { items, revs }: Index,
    state: SyncedItems,
    known: Map<string, Body | undefined>,
    removable: Set<string>,
  ) {
    const ids = new Set(items.map(idOf));
    const next: SyncedItems = {};
    const values = await mapLimit(items, async (meta) => {
      const id = idOf(meta);
      const rev = revs[id] ?? "";
      let body = known.get(id);
      if (!known.has(id) && state[id]?.rev === rev)
        body = (await readLocalDocument(transport, itemName(id), bodies))
          ?.value;
      if (body === undefined && !known.has(id))
        body = (await readDocument(transport, itemName(id), bodies)).value;
      next[id] = { rev, body: hashBody(body) };
      return join(meta, body);
    });
    for (const id of Object.keys(state))
      if (!ids.has(id)) await forget(id, removable.has(id));
    if (JSON.stringify(next) !== JSON.stringify(state)) await writeState(next);
    return values;
  }

  return {
    async read() {
      const state = await readState();
      const { value } = await readDocument(transport, key, index);
      if (!value) {
        await Promise.all(Object.keys(state).map((id) => forget(id, false)));
        await getBrowserApi().storage.local.remove(stateKey);
        return undefined;
      }
      return reconcile(value, state, new Map(), new Set());
    },

    async write(value: unknown) {
      if (!Array.isArray(value))
        throw new Error(`Sync collection ${key} must be an array.`);
      const state = await readState();
      const entries = value
        .filter((item): item is Item => hasStringKey(item, idField))
        .map((item) => ({ id: idOf(item), ...split(item) }));
      const known = new Map<string, Body | undefined>();
      const written: Record<string, string> = {};
      // Content first: the index must never point at content not yet stored.
      await mapLimit(entries, async ({ id, body }) => {
        if (state[id]?.body === hashBody(body)) return;
        const result = await writeDocument(
          transport,
          itemName(id),
          body,
          bodies,
        );
        known.set(id, result.value);
        written[id] = result.rev;
      });
      let merged = (
        await writeDocument(
          transport,
          key,
          { items: entries.map(({ meta }) => meta), revs: written },
          index,
        )
      ).value!;
      // Concurrent writers of one item race on its rev. The last content
      // write includes all others, so the index must name the current one.
      for (let attempt = 0; attempt < MAX_REV_FIXES; attempt++) {
        const fixes: Record<string, string> = {};
        for (const id of Object.keys(written)) {
          if (merged.revs[id] === written[id] || !(id in merged.revs)) continue;
          const current = await readDocument(transport, itemName(id), bodies);
          known.set(id, current.value);
          if (current.rev && current.rev !== merged.revs[id])
            fixes[id] = current.rev;
        }
        if (!Object.keys(fixes).length) break;
        Object.assign(written, fixes);
        merged = (
          await writeDocument(
            transport,
            key,
            { items: merged.items, revs: fixes },
            index,
          )
        ).value!;
      }
      // Content of items this device synced but that are no longer indexed
      // (deleted here or elsewhere) is removed from the cloud as well.
      const removable = new Set([...Object.keys(state), ...known.keys()]);
      for (const id of Object.keys(written))
        state[id] ??= { rev: "", body: "" };
      return reconcile(merged, state, known, removable);
    },

    async remove() {
      const state = await readState();
      await transport.removeFolder(key);
      await removeDocument(transport, key);
      await Promise.all(Object.keys(state).map((id) => forget(id, false)));
      await getBrowserApi().storage.local.remove(stateKey);
    },
  };
}

async function mapLimit<T, R>(items: T[], run: (item: T) => Promise<R>) {
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

function hashBody(body: Body | undefined) {
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

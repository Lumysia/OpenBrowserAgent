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
// index document (each item's other fields plus the revs of its content) and
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
// An item's content rev: each device writes only its own cell (the rev of the
// content document it stored), so concurrent writers never overwrite each
// other's rev and a reader sees a change whenever any cell changes.
type Revs = Record<string, string>;
type Index = { items: Item[]; revs: Record<string, Revs> };
// What this device last synced per item: the revs its local content matches
// and a hash of that content, so unchanged items are neither uploaded nor
// downloaded.
type SyncedItems = Record<string, { rev: Revs; body: string }>;

const ITEMS_TABLE = "items";
const REVS_TABLE = "revs";
const ITEM_CONCURRENCY = 4;

// Decoded content of unchanged items, so a refresh decodes each stored
// replica at most once per background lifetime.
const bodyCache = new Map<string, { rev: string; body: Body | undefined }>();

// `revs` sets only the given cells; the others keep theirs.
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
  const itemScope = (id: string) =>
    documentScope(transport.config, itemName(id));
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
    bodyCache.delete(itemScope(id));
    if (removeRemote) await removeDocument(transport, itemName(id));
    else await removeLocalTinyBaseSyncDocument(itemScope(id));
  }

  // This device's replica of an item, without a request.
  async function localBody(id: string, rev: Revs) {
    const cached = bodyCache.get(itemScope(id));
    if (cached?.rev === revKey(rev)) return cached.body;
    const body = (await readLocalDocument(transport, itemName(id), bodies))
      ?.value;
    bodyCache.set(itemScope(id), { rev: revKey(rev), body });
    return body;
  }

  // Fetch an item's content. It is synced with the index row only when the
  // document is one the row names; a document not yet stored (or, with browser
  // sync, not yet delivered) is fetched again next time.
  async function fetchBody(id: string, row: Revs, base: Revs | undefined) {
    const { value, rev } = await readDocument(transport, itemName(id), bodies);
    if (value === undefined)
      return { body: await localBody(id, base ?? {}), synced: false };
    return { body: value, synced: !!rev && Object.values(row).includes(rev) };
  }

  // Bring every indexed item up to date, fetching only content whose revs
  // changed. `local` holds content this operation already has, `expected` the
  // revs that content matches when it differs from the saved state.
  async function reconcile(
    { items, revs }: Index,
    state: SyncedItems,
    local: Map<string, Body>,
    expected: Record<string, Revs>,
    removable: Set<string>,
  ) {
    const ids = new Set(items.map(idOf));
    const next: SyncedItems = {};
    const values = await mapLimit(items, async (meta) => {
      const id = idOf(meta);
      const row = revs[id] ?? {};
      const base = expected[id] ?? state[id]?.rev;
      const have = async () =>
        local.get(id) ?? (await localBody(id, base ?? {}));
      let body: Body | undefined;
      let synced = true;
      if (base && sameRevs(row, base)) body = await have();
      else if (!Object.keys(row).length) {
        // Indexed without stored content (cloud data was cleared meanwhile).
        body = await have();
        synced = false;
      } else ({ body, synced } = await fetchBody(id, row, base));
      if (synced) bodyCache.set(itemScope(id), { rev: revKey(row), body });
      next[id] = { rev: synced ? row : (base ?? {}), body: hashBody(body) };
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
      return reconcile(value, state, new Map(), {}, new Set());
    },

    async write(value: unknown) {
      if (!Array.isArray(value))
        throw new Error(`Sync collection ${key} must be an array.`);
      const state = await readState();
      const device = await syncDeviceId();
      const entries = value
        .filter((item): item is Item => hasStringKey(item, idField))
        .map((item) => ({ id: idOf(item), ...split(item) }));
      const local = new Map(entries.map(({ id, body }) => [id, body]));
      const stored = new Set<string>();
      const expected: Record<string, Revs> = {};
      const written: Record<string, Revs> = {};
      let current: Record<string, Revs | undefined> = Object.fromEntries(
        Object.entries(state).map(([id, { rev }]) => [id, rev]),
      );
      const upload = async (
        { id, body }: { id: string; body: Body },
        fresh = false,
      ) => {
        const result = await writeDocument(
          transport,
          itemName(id),
          body,
          bodies,
          fresh,
        );
        local.set(id, result.value ?? body);
        stored.add(id);
        written[id] = { [device]: result.rev };
        expected[id] = { ...current[id], [device]: result.rev };
      };
      const writeIndex = (items: Item[], revs: Record<string, Revs>) =>
        writeDocument(transport, key, { items, revs }, index);
      // Content first: the index must never name content not yet stored.
      await mapLimit(
        entries.filter(({ id, body }) => state[id]?.body !== hashBody(body)),
        upload,
      );
      const first = await writeIndex(
        entries.map(({ meta }) => meta),
        written,
      );
      let merged = first.value!;
      // Content is stored again where the index names no rev for it, or the
      // index itself was gone (cloud data was cleared meanwhile).
      const lost = entries.filter(
        ({ id }) => !stored.has(id) && (first.created || !(id in merged.revs)),
      );
      if (lost.length) {
        current = merged.revs;
        for (const id of Object.keys(written)) delete written[id];
        await mapLimit(lost, (entry) => upload(entry, true));
        merged = (await writeIndex(merged.items, written)).value!;
      }
      // Content of items this device synced but that are no longer indexed
      // (deleted here or elsewhere) is removed from the cloud as well.
      const removable = new Set([...Object.keys(state), ...stored]);
      return reconcile(merged, state, local, expected, removable);
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

// Stable per-device identity for rev cells.
async function syncDeviceId() {
  const storageKey = STORAGE_KEYS.syncDeviceId;
  const local = getBrowserApi().storage.local;
  const stored = (await local.get(storageKey))[storageKey];
  if (typeof stored === "string" && stored) return stored;
  const id = crypto.randomUUID();
  await local.set({ [storageKey]: id });
  return id;
}

function sameRevs(left: Revs, right: Revs) {
  return revKey(left) === revKey(right);
}

function revKey(revs: Revs) {
  return JSON.stringify(
    Object.entries(revs).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
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

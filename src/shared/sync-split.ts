import { getBrowserApi } from "./browser-api";
import { STORAGE_KEYS } from "./storage-keys";
import { SPLIT_ITEMS } from "./storage-split";
import {
  documentScope,
  readDocument,
  readLocalDocument,
  removeDocument,
  writeDocument,
  type DocumentTransport,
} from "./sync-documents";
import {
  bodyCodec,
  hashBody,
  indexCodec,
  mapLimit,
  revKey,
  sameRevs,
  syncDeviceId,
  type Body,
  type Index,
  type Item,
  type Revs,
  type SplitCollection,
} from "./sync-split-format";
import {
  hasStringKey,
  removeLocalTinyBaseSyncDocument,
  tinybaseSyncLocalCacheKey,
} from "./sync-tinybase-doc";

// A collection whose items carry large content. Its cloud form is a small
// index document (each item's other fields plus the revs of its content) and
// one content document per item, so a change uploads and downloads only the
// items it touched.
const SPLIT_COLLECTIONS: SplitCollection[] = [
  {
    key: STORAGE_KEYS.chats,
    idField: "id",
    body: SPLIT_ITEMS[STORAGE_KEYS.chats].content,
    omitEmpty: ["sources", "imageGenerationJobs"],
    lazy: true,
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

// `value` absent and not `unchanged`: the item or its content is missing.
export type ItemRead = { value?: Item; unchanged?: boolean };
// What this device last synced per item: the revs its local content matches
// and a hash of that content, so unchanged items are neither uploaded nor
// downloaded.
type SyncedItems = Record<string, { rev: Revs; body: string }>;

// Decoded content of unchanged items, so a refresh decodes each stored
// replica at most once per background lifetime.
const bodyCache = new Map<string, { rev: string; body: Body | undefined }>();

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

  // Store the given contents, then the index; returns the merged index and
  // what this device now has. Entries without a body keep their content.
  async function store(
    entries: Array<{ id: string; meta: Item; body?: Body }>,
  ) {
    const state = await readState();
    const device = await syncDeviceId();
    const local = new Map<string, Body>();
    for (const { id, body } of entries) if (body) local.set(id, body);
    const stored = new Set<string>();
    const expected: Record<string, Revs> = {};
    const written: Record<string, Revs> = {};
    let current: Record<string, Revs | undefined> = Object.fromEntries(
      Object.entries(state).map(([id, { rev }]) => [id, rev]),
    );
    const upload = async (id: string, body: Body, fresh = false) => {
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
    await mapLimit([...local], async ([id, body]) => {
      if (state[id]?.body !== hashBody(body)) await upload(id, body);
    });

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
      await mapLimit(lost, async ({ id }) => {
        const body =
          local.get(id) ?? (await localBody(id, state[id]?.rev ?? {}));
        if (body) await upload(id, body, true);
      });
      merged = (await writeIndex(merged.items, written)).value!;
    }
    // Content of items this device synced but that are no longer indexed
    // (deleted here or elsewhere) is removed from the cloud as well.
    const removable = new Set([...Object.keys(state), ...stored]);
    return { merged, state, local, stored, expected, removable };
  }

  async function forgetRemoved(
    { items }: Index,
    state: SyncedItems,
    removable: Set<string>,
  ) {
    const ids = new Set(items.map(idOf));
    const removed = Object.keys(state).filter((id) => !ids.has(id));
    for (const id of removed) await forget(id, removable.has(id));
    return removed;
  }

  async function readIndex() {
    const state = await readState();
    const { value } = await readDocument(transport, key, index);
    if (!value) {
      await Promise.all(Object.keys(state).map((id) => forget(id, false)));
      await getBrowserApi().storage.local.remove(stateKey);
    }
    return { value, state };
  }

  const entriesOf = (value: unknown) => {
    if (!Array.isArray(value))
      throw new Error(`Sync collection ${key} must be an array.`);
    return value
      .filter((item): item is Item => hasStringKey(item, idField))
      .map((item) => ({ id: idOf(item), ...split(item) }));
  };

  return {
    // Every item with its content. A lazy collection returns its items'
    // other fields only; content is read per item with `readItem`.
    async read() {
      const { value, state } = await readIndex();
      if (!value) return undefined;
      if (!collection.lazy)
        return reconcile(value, state, new Map(), {}, new Set());
      const removed = await forgetRemoved(value, state, new Set());
      if (removed.length) {
        for (const id of removed) delete state[id];
        await writeState(state);
      }
      return value.items;
    },

    async write(value: unknown) {
      if (collection.lazy) return (await writeItems(value, {})).value;
      const { merged, state, local, expected, removable } = await store(
        entriesOf(value),
      );
      return reconcile(merged, state, local, expected, removable);
    },

    writeItems,
    readItem,
    remove,
  };

  // Lazy collections: write the items' other fields and the given items'
  // content; returns the merged items and the merged given contents.
  async function writeItems(value: unknown, contents: Record<string, Item>) {
    const entries = entriesOf(value).map(({ id, meta }) => ({
      id,
      meta,
      body: id in contents ? split(contents[id]).body : undefined,
    }));
    const { merged, state, local, stored, expected, removable } =
      await store(entries);
    const next = { ...state };
    for (const id of await forgetRemoved(merged, state, removable))
      delete next[id];
    for (const id of stored) {
      const row = merged.revs[id] ?? {};
      const synced = sameRevs(row, expected[id]);
      next[id] = {
        rev: synced ? row : expected[id],
        body: hashBody(local.get(id)),
      };
      if (synced)
        bodyCache.set(itemScope(id), {
          rev: revKey(row),
          body: local.get(id),
        });
    }
    if (JSON.stringify(next) !== JSON.stringify(state)) await writeState(next);
    const ids = new Set(merged.items.map(idOf));
    return {
      value: merged.items,
      contents: Object.fromEntries(
        Object.keys(contents)
          .filter((id) => ids.has(id) && local.has(id))
          .map((id) => [id, join({}, local.get(id))]),
      ),
    };
  }

  // One item's content, fetched only when its revs differ from the content
  // this device has (`have`). `unchanged`: the device's copy is current.
  async function readItem(id: string, have: boolean): Promise<ItemRead> {
    const state = await readState();
    const current =
      (await readLocalDocument(transport, key, index))?.value ??
      (await readDocument(transport, key, index)).value;
    if (!current?.items.some((item) => idOf(item) === id)) return {};
    const row = current.revs[id] ?? {};
    const base = state[id]?.rev;
    if (base && sameRevs(row, base)) {
      if (have) return { unchanged: true };
      const body = await localBody(id, row);
      if (body) return { value: join({}, body) };
    }
    if (!Object.keys(row).length) {
      if (have) return { unchanged: true };
      const body = await localBody(id, base ?? {});
      return body ? { value: join({}, body) } : {};
    }
    const { body, synced } = await fetchBody(id, row, base);
    if (!body) return have ? { unchanged: true } : {};
    if (synced) bodyCache.set(itemScope(id), { rev: revKey(row), body });
    await writeState({
      ...state,
      [id]: { rev: synced ? row : (base ?? {}), body: hashBody(body) },
    });
    return { value: join({}, body) };
  }

  async function remove() {
    const state = await readState();
    await transport.removeFolder(key);
    await removeDocument(transport, key);
    await Promise.all(Object.keys(state).map((id) => forget(id, false)));
    await getBrowserApi().storage.local.remove(stateKey);
  }
}

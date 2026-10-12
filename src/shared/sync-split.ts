import { getBrowserApi } from "./browser-api";
import type { SyncItemRead } from "./sync-backends";
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

// What this device last synced per item: the revs its local content matches
// and a hash of that content, so unchanged items are neither uploaded nor
// downloaded.
type SyncedItems = Record<string, { rev: Revs; body: string }>;

// Cloud form of a split collection (see sync-split-format): an index document
// plus one content document per item.
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
  const idsOf = (value: Index | undefined) =>
    new Set(value?.items.map(idOf) ?? []);

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

  // Items no longer indexed (removed elsewhere) leave this device's replicas.
  async function forgetUnindexed(value: Index, state: SyncedItems) {
    const ids = idsOf(value);
    const removed = Object.keys(state).filter((id) => !ids.has(id));
    for (const id of removed) await forget(id, false);
    return removed;
  }

  // This device's replica of an item, without a request.
  async function localBody(id: string) {
    return (await readLocalDocument(transport, itemName(id), bodies))?.value;
  }

  // Fetch an item's content. It is synced with the index row only when the
  // document is one the row names; a document not yet stored (or, with browser
  // sync, not yet delivered) is fetched again next time.
  async function fetchBody(id: string, row: Revs) {
    const { value, rev } = await readDocument(transport, itemName(id), bodies);
    if (value === undefined)
      return { body: await localBody(id), synced: false };
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
  ) {
    const next: SyncedItems = {};
    const values = await mapLimit(items, async (meta) => {
      const id = idOf(meta);
      const row = revs[id] ?? {};
      const base = expected[id] ?? state[id]?.rev;
      let body: Body | undefined;
      let synced = true;
      if (base && sameRevs(row, base))
        body = local.get(id) ?? (await localBody(id));
      else if (!Object.keys(row).length) {
        // Indexed without stored content (cloud data was cleared meanwhile).
        body = local.get(id) ?? (await localBody(id));
        synced = false;
      } else ({ body, synced } = await fetchBody(id, row));
      next[id] = { rev: synced ? row : (base ?? {}), body: hashBody(body) };
      return join(meta, body);
    });
    if (JSON.stringify(next) !== JSON.stringify(state)) await writeState(next);
    return values;
  }

  // Store the given contents, then the index. Returns the merged index, what
  // this device now has, and the items whose content the cloud lacks but
  // this write was not given (`missing`). Content of items that this write
  // removed, or that are no longer indexed, leaves the cloud.
  async function store(
    entries: Array<{ id: string; meta: Item; body?: Body }>,
  ) {
    const state = await readState();
    const device = await syncDeviceId();
    const before = (await readLocalDocument(transport, key, index))?.value;
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
    // Content is missing where the index names no rev for it, or everywhere
    // when the index this device knew was gone (cloud data was cleared, maybe
    // after this write stored its content).
    const cleared =
      first.created && (!!before || Object.keys(state).length > 0);
    const missing = entries
      .map(({ id }) => id)
      .filter((id) => cleared || !(id in merged.revs));
    const resend = missing.filter((id) => local.has(id));
    if (resend.length) {
      current = merged.revs;
      for (const id of Object.keys(written)) delete written[id];
      await mapLimit(resend, (id) => upload(id, local.get(id)!, true));
      merged = (await writeIndex(merged.items, written)).value!;
    }
    const indexed = idsOf(merged);
    const removed = [
      ...new Set([...Object.keys(state), ...stored, ...idsOf(before)]),
    ].filter((id) => !indexed.has(id));
    for (const id of removed) await forget(id, true);
    return {
      merged,
      state,
      local,
      stored,
      expected,
      missing: missing.filter((id) => !local.has(id)),
    };
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
      const removed = await forgetUnindexed(value, state);
      if (!collection.lazy) return reconcile(value, state, new Map(), {});
      if (removed.length) {
        for (const id of removed) delete state[id];
        await writeState(state);
      }
      return value.items;
    },

    async write(value: unknown) {
      if (collection.lazy) return (await writeItems(value, {})).value;
      const { merged, state, local, expected } = await store(entriesOf(value));
      return reconcile(merged, state, local, expected);
    },

    writeItems,
    readItem,
    remove,
  };

  // Lazy collections: write the items' other fields and the given items'
  // content; returns the merged items, the merged given contents, and the
  // items whose content the cloud lacks (to be sent by the caller).
  async function writeItems(value: unknown, contents: Record<string, Item>) {
    const entries = entriesOf(value).map(({ id, meta }) => ({
      id,
      meta,
      body: id in contents ? split(contents[id]).body : undefined,
    }));
    const { merged, state, local, stored, expected, missing } =
      await store(entries);
    const ids = idsOf(merged);
    // Missing content is no longer synced: the next write sends it.
    const next: SyncedItems = Object.fromEntries(
      Object.entries(state).filter(
        ([id]) => ids.has(id) && !missing.includes(id),
      ),
    );
    for (const id of stored) {
      if (!ids.has(id)) continue;
      const row = merged.revs[id] ?? {};
      next[id] = {
        rev: sameRevs(row, expected[id]) ? row : expected[id],
        body: hashBody(local.get(id)),
      };
    }
    if (JSON.stringify(next) !== JSON.stringify(state)) await writeState(next);
    return {
      value: merged.items,
      contents: Object.fromEntries(
        Object.keys(contents)
          .filter((id) => ids.has(id) && local.has(id))
          .map((id) => [id, join({}, local.get(id))]),
      ),
      missing,
    };
  }

  // One item's content, fetched only when its revs differ from the content
  // this device has (`have`). `unchanged`: the device's copy is current.
  async function readItem(id: string, have: boolean): Promise<SyncItemRead> {
    const state = await readState();
    const current =
      (await readLocalDocument(transport, key, index))?.value ??
      (await readDocument(transport, key, index)).value;
    if (!current?.items.some((item) => idOf(item) === id)) return {};
    const row = current.revs[id] ?? {};
    const base = state[id]?.rev;
    // Unchanged, or not in the cloud: this device's copy is the best there is.
    if ((base && sameRevs(row, base)) || !Object.keys(row).length) {
      if (have) return { unchanged: true };
      const body = await localBody(id);
      if (body || !Object.keys(row).length)
        return body ? { value: join({}, body) } : {};
    }
    const { body, synced } = await fetchBody(id, row);
    if (!body) return have ? { unchanged: true } : {};
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

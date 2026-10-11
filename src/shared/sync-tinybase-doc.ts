import { createMergeableStore } from "tinybase";
import type { Cell, Row, Table, Tables } from "tinybase";
import { base64ToBytes, bytesToBase64 } from "./binary";
import { getBrowserApi } from "./browser-api";

const TINYBASE_SYNC_DOCUMENT_PREFIX = "OpenBrowserAgentTinyBaseSync:";
const TINYBASE_SYNC_DOCUMENT_FORMAT = "openbrowseragent.tinybase-sync.v3";
const ORDER_CELL = "__openBrowserAgentSyncOrder";

type TinyBaseSyncDocument = {
  format: typeof TINYBASE_SYNC_DOCUMENT_FORMAT;
  content: unknown;
  undefinedPaths?: Array<Array<string | number>>;
};

export type SyncStore = ReturnType<typeof createMergeableStore>;

// Maps an app value onto a document's TinyBase tables and back. `keepUnseen`
// keeps rows the value doesn't mention (a fresh replica never saw them).
export type SyncDocCodec<T> = {
  set(store: SyncStore, value: T, keepUnseen: boolean): void;
  get(store: SyncStore): T | undefined;
};

export type SyncDocResult<T> = {
  bytes: Uint8Array;
  value: T | undefined;
  // Identity of `bytes`' content; equal content has an equal rev.
  rev: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function readTinyBaseSyncValue<T>(
  key: string,
  remoteBytes: Uint8Array | undefined,
  codec: SyncDocCodec<T> = valueCodec as SyncDocCodec<T>,
) {
  if (!remoteBytes) {
    await removeLocalTinyBaseSyncDocument(key);
    return undefined;
  }
  return (await mergeTinyBaseSyncValue(key, remoteBytes, codec)).value;
}

// Merge a remote document into the local replica. Also used on a transport
// retry: applying the user's snapshot again would give stale fields new
// timestamps and undo remote edits.
export async function mergeTinyBaseSyncValue<T>(
  key: string,
  remoteBytes: Uint8Array,
  codec: SyncDocCodec<T> = valueCodec as SyncDocCodec<T>,
): Promise<SyncDocResult<T> & { remoteRev: string }> {
  const localBytes = await readLocalTinyBaseSyncBytes(key);
  const remoteStore = decodeStore(key, remoteBytes);
  const remoteRev = storeRev(remoteStore);
  if (!localBytes || sameBytes(localBytes, remoteBytes)) {
    if (!localBytes) await writeLocalTinyBaseSyncBytes(key, remoteBytes);
    const value = codec.get(remoteStore);
    return { bytes: remoteBytes, value, rev: remoteRev, remoteRev };
  }
  const store = decodeStore(key, localBytes).merge(remoteStore);
  const bytes = encodeStore(store);
  if (!sameBytes(localBytes, bytes))
    await writeLocalTinyBaseSyncBytes(key, bytes);
  return { bytes, value: codec.get(store), rev: storeRev(store), remoteRev };
}

export function decodeTinyBaseSyncValue<T>(
  key: string,
  bytes: Uint8Array,
  codec: SyncDocCodec<T> = valueCodec as SyncDocCodec<T>,
) {
  return codec.get(decodeStore(key, bytes));
}

// The value of the local replica alone, without any remote request.
export async function readLocalTinyBaseSyncValue<T>(
  key: string,
  codec: SyncDocCodec<T>,
) {
  const bytes = await readLocalTinyBaseSyncBytes(key);
  return bytes ? { value: codec.get(decodeStore(key, bytes)) } : undefined;
}

export async function writeTinyBaseSyncValue<T>(
  key: string,
  value: T,
  remoteBytes: Uint8Array | undefined,
  codec: SyncDocCodec<T> = valueCodec as SyncDocCodec<T>,
): Promise<SyncDocResult<T>> {
  const localBytes = await readLocalTinyBaseSyncBytes(key);
  let store: SyncStore;
  if (!localBytes && remoteBytes) {
    // A fresh replica first takes in the remote document so its clock is past
    // every remote stamp; otherwise a device with a fast clock would win over
    // this edit. Rows and cells the edit doesn't mention stay, since this
    // device never saw them and must not delete them.
    store = decodeStore(key, remoteBytes);
    codec.set(store, value, true);
  } else {
    store = localBytes ? decodeStore(key, localBytes) : createMergeableStore();
    codec.set(store, value, false);
    if (remoteBytes) store.merge(decodeStore(key, remoteBytes));
  }
  const bytes = encodeStore(store);
  if (!localBytes || !sameBytes(localBytes, bytes))
    await writeLocalTinyBaseSyncBytes(key, bytes);
  return { bytes, value: codec.get(store), rev: storeRev(store) };
}

export async function removeLocalTinyBaseSyncDocument(key: string) {
  await getBrowserApi().storage.local.remove(tinybaseSyncLocalCacheKey(key));
}

export function sameBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function readLocalTinyBaseSyncBytes(key: string) {
  const cacheKey = tinybaseSyncLocalCacheKey(key);
  const encoded = (await getBrowserApi().storage.local.get(cacheKey))[
    cacheKey
  ] as string | undefined;
  return encoded ? base64ToBytes(encoded) : undefined;
}

async function writeLocalTinyBaseSyncBytes(key: string, bytes: Uint8Array) {
  await getBrowserApi().storage.local.set({
    [tinybaseSyncLocalCacheKey(key)]: bytesToBase64(bytes),
  });
}

function storeRev(store: SyncStore) {
  return store
    .getMergeableContentHashes()
    .map((hash) => hash.toString(36))
    .join(".");
}

function encodeStore(store: SyncStore) {
  const content = store.getMergeableContent();
  const paths = undefinedPaths(content);
  return encoder.encode(
    `${TINYBASE_SYNC_DOCUMENT_PREFIX}${JSON.stringify({
      format: TINYBASE_SYNC_DOCUMENT_FORMAT,
      content,
      ...(paths.length ? { undefinedPaths: paths } : {}),
    } satisfies TinyBaseSyncDocument)}`,
  );
}

function decodeStore(key: string, bytes: Uint8Array) {
  const text = decoder.decode(bytes);
  if (!text.startsWith(TINYBASE_SYNC_DOCUMENT_PREFIX))
    throw new Error(`Invalid TinyBase sync document for ${key}.`);
  const document = JSON.parse(
    text.slice(TINYBASE_SYNC_DOCUMENT_PREFIX.length),
  ) as Partial<TinyBaseSyncDocument>;
  if (document.format !== TINYBASE_SYNC_DOCUMENT_FORMAT)
    throw new Error(`Unsupported TinyBase sync document for ${key}.`);
  restoreUndefinedPaths(document.content, document.undefinedPaths);
  assertMergeableContent(document.content);
  // A document/cache key is shared by replicas. Let TinyBase generate a unique
  // writer identity so simultaneous changes have a deterministic tie-breaker.
  return createMergeableStore().setMergeableContent(
    document.content as Parameters<SyncStore["setMergeableContent"]>[0],
  );
}

// Plain values: a scalar, an array of `{ id }` items, or a record.
export const valueCodec: SyncDocCodec<unknown> = {
  set(store, value, keepUnseen) {
    const tables = tablesFromValue(value);
    if (tables && keepUnseen)
      for (const [tableId, rows] of Object.entries(store.getTables())) {
        const table = (tables[tableId] ||= {});
        for (const [rowId, row] of Object.entries(rows))
          table[rowId] = { ...row, ...table[rowId] };
      }
    // An empty entry can later gain fields through a merge. Its presence cell
    // remains part of that retained row's identity; dropping it on an
    // unrelated rewrite would defeat a concurrent clear. Do not retain it for
    // rows absent from the requested snapshot.
    if (tables && !Array.isArray(value)) {
      for (const [id, row] of Object.entries(tables.items)) {
        const presence = store.getCell("items", id, ORDER_CELL);
        if (presence !== undefined) row[ORDER_CELL] = presence;
      }
    }
    // setTables rejects a snapshot with no cells, leaving old rows intact.
    // Omit empty tables so setContent uses TinyBase's deletion operation when
    // the snapshot is empty, preserving tombstones and unchanged-cell stamps.
    store.setContent([
      Object.fromEntries(
        Object.entries(tables || {}).filter(
          ([, table]) => Object.keys(table).length,
        ),
      ),
      tables
        ? { kind: Array.isArray(value) ? "array" : "record" }
        : { kind: "scalar", value: toCellValue(value) },
    ]);
  },
  get(store) {
    const kind = store.getValue("kind");
    if (kind === "array") return itemsFromTable(store.getTable("items"), "id");
    if (kind === "record") return recordFromTable(store.getTable("items"));
    return store.getValue("value");
  },
};

// Replace one table with keyed rows in array order. Unchanged cells keep their
// stamps; an empty snapshot deletes the table (setTable rejects no cells).
export function setOrderedTable(
  store: SyncStore,
  tableId: string,
  items: unknown,
  keyField: string,
  keepUnseen: boolean,
) {
  const rows = rowsFromItems(items, keyField);
  if (keepUnseen)
    for (const [rowId, row] of Object.entries(store.getTable(tableId)))
      rows[rowId] = { ...row, ...rows[rowId] };
  if (Object.keys(rows).length) store.setTable(tableId, rows);
  else store.delTable(tableId);
}

// Rows in their stored order, with the row id restored as `keyField`.
export function itemsFromTable(table: Table | undefined, keyField: string) {
  return Object.entries(table || {})
    .sort(([, left], [, right]) => compareByOrderThenCreatedAt(left, right))
    .map(([rowId, row]) => ({ [keyField]: rowId, ...stripInternalCells(row) }));
}

function tablesFromValue(value: unknown): Tables | undefined {
  if (Array.isArray(value) && value.every((item) => hasStringKey(item, "id")))
    return { items: rowsFromItems(value, "id") };
  if (isPlainRecord(value)) return { items: rowsFromRecord(value) };
  return undefined;
}

function rowsFromItems(items: unknown, keyField: string) {
  const rows: Record<string, Row> = {};
  if (!Array.isArray(items)) return rows;
  for (const [index, item] of items.entries())
    if (hasStringKey(item, keyField))
      rows[item[keyField] as string] = withOrder(rowFromRecord(item), index);
  return rows;
}

function rowsFromRecord(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).map(([id, item]) => [
      id,
      isPlainRecord(item)
        ? rowFromRecord(item)
        : { id, value: toCellValue(item) },
    ]),
  );
}

function recordFromTable(table: Table) {
  return Object.fromEntries(
    Object.entries(table || {}).map(([id, row]) => {
      const cleanRow = stripInternalCells(row);
      if (!Object.keys(cleanRow).length) return [id, {}];
      const { id: _id, value, ...rest } = cleanRow;
      return [id, Object.keys(rest).length ? cleanRow : value];
    }),
  );
}

function rowFromRecord(value: Record<string, unknown>) {
  const row = Object.fromEntries(
    Object.entries(value)
      .filter(([, cell]) => cell !== undefined)
      .map(([key, cell]) => [key, toCellValue(cell)]),
  );
  // TinyBase drops empty rows. Reuse the internal cell already stripped from
  // array rows to retain an empty object, without restamping populated records.
  return Object.keys(row).length ? row : withOrder(row, 0);
}

function toCellValue(value: unknown): Cell {
  if (value === undefined) return null;
  return value as Cell;
}

function withOrder(row: Record<string, Cell>, index: number) {
  return { ...row, [ORDER_CELL]: index };
}

function stripInternalCells(row: Record<string, unknown>) {
  const { [ORDER_CELL]: _order, ...rest } = row;
  return rest;
}

export function hasStringKey(
  value: unknown,
  keyField: string,
): value is Record<string, unknown> {
  return isPlainRecord(value) && typeof value[keyField] === "string";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function compareByOrderThenCreatedAt(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  const leftOrder = typeof left[ORDER_CELL] === "number" ? left[ORDER_CELL] : 0;
  const rightOrder =
    typeof right[ORDER_CELL] === "number" ? right[ORDER_CELL] : 0;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  const leftCreatedAt = typeof left.createdAt === "number" ? left.createdAt : 0;
  const rightCreatedAt =
    typeof right.createdAt === "number" ? right.createdAt : 0;
  return leftCreatedAt - rightCreatedAt;
}

const TINYBASE_SYNC_CACHE_PREFIX = "tinybase-sync-doc";

export function tinybaseSyncLocalCacheKey(key: string) {
  return `${TINYBASE_SYNC_CACHE_PREFIX}:${key}`;
}

// Local sync state is keyed `tinybase-sync-doc:<scope>:<document>`, where a
// document is `<dataKey>`, `<dataKey>/<item>` or `<dataKey>#<state>`.
// Document names never contain ":" (item ids are URI-encoded).
export function syncLocalDataKey(storedKey: string) {
  if (!storedKey.startsWith(tinybaseSyncLocalCacheKey(""))) return undefined;
  return storedKey.slice(storedKey.lastIndexOf(":") + 1).split(/[/#]/)[0];
}

type JsonPath = Array<string | number>;

// setMergeableContent silently ignores malformed input. Reject corrupt remote
// envelopes before treating them as an empty document or persisting them locally.
function assertMergeableContent(content: unknown) {
  if (
    !Array.isArray(content) ||
    content.length !== 2 ||
    !isStamp(content[0], 3) ||
    !isStamp(content[1], 1)
  )
    throw new Error("Invalid TinyBase sync content.");
}

function isStamp(value: unknown, depth: number): boolean {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    typeof value[1] !== "string" ||
    typeof value[2] !== "number" ||
    !Number.isFinite(value[2])
  )
    return false;
  if (!depth) return true;
  return (
    !!value[0] &&
    typeof value[0] === "object" &&
    !Array.isArray(value[0]) &&
    Object.values(value[0]).every((child) => isStamp(child, depth - 1))
  );
}

// JSON turns undefined array elements into null. TinyBase uses undefined for
// tombstones and supports real null values, so their locations must travel with
// the document. Paths avoid reserving any string/object value in user data.
function undefinedPaths(value: unknown, path: JsonPath = []): JsonPath[] {
  if (value === undefined) return [path];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    undefinedPaths(child, [...path, Array.isArray(value) ? Number(key) : key]),
  );
}

function restoreUndefinedPaths(value: unknown, paths: unknown) {
  if (paths === undefined) return;
  if (!Array.isArray(paths))
    throw new Error("Invalid sync document tombstones.");
  for (const path of paths) {
    if (!Array.isArray(path) || !path.length)
      throw new Error("Invalid sync document tombstone path.");
    let parent = value;
    for (const [index, key] of path.entries()) {
      if (
        (typeof key !== "string" && typeof key !== "number") ||
        !parent ||
        typeof parent !== "object" ||
        !Object.hasOwn(parent, key)
      )
        throw new Error("Invalid sync document tombstone path.");
      const record = parent as Record<string | number, unknown>;
      if (index === path.length - 1) {
        if (record[key] !== null)
          throw new Error("Invalid sync document tombstone value.");
        record[key] = undefined;
      } else parent = record[key];
    }
  }
}

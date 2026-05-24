import { createMergeableStore } from "tinybase";
import type { Cell, Tables } from "tinybase";
import { getBrowserApi } from "./browser-api";
import { STORAGE_KEYS } from "./storage-keys";
import { tinybaseSyncLocalCacheKey } from "./sync-tinybase-keys";

const TINYBASE_SYNC_DOCUMENT_PREFIX = "OpenBrowserAgentTinyBaseSync:";
const TINYBASE_SYNC_DOCUMENT_FORMAT = "openbrowseragent.tinybase-sync.v1";
const ORDER_CELL = "__openBrowserAgentSyncOrder";

type TinyBaseSyncDocument = {
  format: typeof TINYBASE_SYNC_DOCUMENT_FORMAT;
  content: unknown;
};

type SyncStore = ReturnType<typeof createMergeableStore>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function readTinyBaseSyncValue<T>(
  key: string,
  remoteBytes: Uint8Array | undefined,
) {
  if (!remoteBytes) {
    await removeLocalTinyBaseSyncDocument(key);
    return undefined;
  }

  const remoteStore = decodeStore(key, remoteBytes);
  const localStore = await readLocalTinyBaseSyncDocument(key);
  const store = localStore ? localStore.merge(remoteStore) : remoteStore;
  await writeLocalTinyBaseSyncDocument(key, store);
  return valueFromStore<T>(key, store);
}

export function decodeTinyBaseSyncValue<T>(key: string, bytes: Uint8Array) {
  return valueFromStore<T>(key, decodeStore(key, bytes));
}

export async function writeTinyBaseSyncValue<T>(
  key: string,
  value: T,
  remoteBytes: Uint8Array | undefined,
) {
  const store =
    (await readLocalTinyBaseSyncDocument(key)) || createMergeableStore(key);
  setStoreValue(store, key, value);
  if (remoteBytes) store.merge(decodeStore(key, remoteBytes));
  await writeLocalTinyBaseSyncDocument(key, store);
  return { bytes: encodeStore(store), value: valueFromStore<T>(key, store) };
}

export async function removeLocalTinyBaseSyncDocument(key: string) {
  await getBrowserApi().storage.local.remove(tinybaseSyncLocalCacheKey(key));
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readLocalTinyBaseSyncDocument(key: string) {
  const result = await getBrowserApi().storage.local.get(
    tinybaseSyncLocalCacheKey(key),
  );
  const encoded = result[tinybaseSyncLocalCacheKey(key)] as string | undefined;
  return encoded ? decodeStore(key, base64ToBytes(encoded)) : undefined;
}

async function writeLocalTinyBaseSyncDocument(key: string, store: SyncStore) {
  await getBrowserApi().storage.local.set({
    [tinybaseSyncLocalCacheKey(key)]: bytesToBase64(encodeStore(store)),
  });
}

function encodeStore(store: SyncStore) {
  return encoder.encode(
    `${TINYBASE_SYNC_DOCUMENT_PREFIX}${JSON.stringify({
      format: TINYBASE_SYNC_DOCUMENT_FORMAT,
      content: store.getMergeableContent(),
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
  return createMergeableStore(key).setMergeableContent(
    document.content as Parameters<SyncStore["setMergeableContent"]>[0],
  );
}

function setStoreValue<T>(store: SyncStore, key: string, value: T) {
  if (key === STORAGE_KEYS.chats && Array.isArray(value)) {
    store.setTables(tablesFromChats(value as Array<Record<string, unknown>>));
    store.setValues({ kind: "chats" });
    return;
  }
  const tables = tablesFromValue(value);
  if (tables) {
    store.setTables(tables);
    store.setValues({ kind: Array.isArray(value) ? "array" : "record" });
    return;
  }
  store.setTables({});
  store.setValues({ kind: "scalar", value: toCellValue(value) });
}

function valueFromStore<T>(key: string, store: SyncStore) {
  const kind = store.getValue("kind");
  if (key === STORAGE_KEYS.chats && kind === "chats")
    return chatsFromTables(store.getTables()) as T;
  if (kind === "array") return arrayFromTable(store.getTable("items")) as T;
  if (kind === "record") return recordFromTable(store.getTable("items")) as T;
  return store.getValue("value") as T | undefined;
}

function tablesFromValue(value: unknown): Tables | undefined {
  if (Array.isArray(value) && value.every(hasStringId)) {
    return { items: rowsFromItems(value) };
  }
  if (isPlainRecord(value)) {
    return { items: rowsFromRecord(value) };
  }
  return undefined;
}

function tablesFromChats(chats: Array<Record<string, unknown>>): Tables {
  const tables: Tables = { items: {}, messages: {}, sources: {}, jobs: {} };
  for (const [index, chat] of chats.entries()) {
    if (!hasStringId(chat)) continue;
    const { messages, sources, imageGenerationJobs, ...metadata } = chat;
    tables.items[chat.id] = withOrder(rowFromRecord(metadata), index);
    rowsFromNestedItems(tables.messages, chat.id, messages);
    rowsFromNestedItems(tables.sources, chat.id, sources);
    rowsFromNestedItems(tables.jobs, chat.id, imageGenerationJobs);
  }
  return tables;
}

function chatsFromTables(tables: Tables) {
  return Object.entries(tables.items || {})
    .sort(([, left], [, right]) => compareByOrderThenCreatedAt(left, right))
    .map(([id, row]) => {
      const chat = { id, ...stripInternalCells(row) };
      const messages = nestedItemsFromTable(tables.messages, id);
      const sources = nestedItemsFromTable(tables.sources, id);
      const imageGenerationJobs = nestedItemsFromTable(tables.jobs, id);
      return {
        ...chat,
        messages,
        ...(sources.length ? { sources } : {}),
        ...(imageGenerationJobs.length ? { imageGenerationJobs } : {}),
      };
    });
}

function rowsFromNestedItems(
  table: Record<string, Record<string, Cell>>,
  parentId: string,
  value: unknown,
) {
  if (!Array.isArray(value)) return;
  for (const [index, item] of value.entries()) {
    if (!hasStringId(item)) continue;
    table[`${parentId}:${item.id}`] = withOrder(
      { parentId, ...rowFromRecord(item) },
      index,
    );
  }
}

function nestedItemsFromTable(
  tables: Tables[string] | undefined,
  parentId: string,
) {
  return Object.entries(tables || {})
    .filter(([, row]) => row.parentId === parentId)
    .sort(([, left], [, right]) => compareByOrderThenCreatedAt(left, right))
    .map(([, row]) => {
      const { parentId: _parentId, ...item } = row;
      return stripInternalCells(item);
    });
}

function rowsFromItems(items: Array<Record<string, unknown>>) {
  return Object.fromEntries(
    items.map((item, index) => [
      item.id,
      withOrder(rowFromRecord(item), index),
    ]),
  );
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

function arrayFromTable(table: Tables[string]) {
  return Object.entries(table || {})
    .sort(([, left], [, right]) => compareByOrderThenCreatedAt(left, right))
    .map(([id, row]) => ({ id, ...stripInternalCells(row) }));
}

function recordFromTable(table: Tables[string]) {
  return Object.fromEntries(
    Object.entries(table || {}).map(([id, row]) => {
      const cleanRow = stripInternalCells(row);
      const { id: _id, value, ...rest } = cleanRow;
      return [id, Object.keys(rest).length ? cleanRow : value];
    }),
  );
}

function rowFromRecord(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, cell]) => cell !== undefined)
      .map(([key, cell]) => [key, toCellValue(cell)]),
  );
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

function hasStringId(value: unknown): value is Record<string, unknown> & {
  id: string;
} {
  return isPlainRecord(value) && typeof value.id === "string";
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

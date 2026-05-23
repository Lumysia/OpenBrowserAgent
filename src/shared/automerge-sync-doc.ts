import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64";
import * as Automerge from "@automerge/automerge/slim";
import { getBrowserApi } from "./browser-api";

type SyncDocument<T = unknown> = {
  value?: T;
};

const AUTOMERGE_CACHE_PREFIX = "automerge-sync-doc";
let automergeReady: Promise<void> | undefined;
const documentCache = new Map<string, Automerge.Doc<SyncDocument>>();

export function automergeLocalCacheKey(key: string) {
  return `${AUTOMERGE_CACHE_PREFIX}:${key}`;
}

export async function readAutomergeValue<T>(
  key: string,
  remoteBytes: Uint8Array | undefined,
) {
  await initializeAutomerge();
  if (!remoteBytes) {
    await removeLocalAutomergeDocument(key);
    return undefined;
  }
  const doc = await mergeWithLocalDocument<T>(key, remoteBytes);
  return doc?.value as T | undefined;
}

export async function readCachedAutomergeValue<T>(key: string) {
  await initializeAutomerge();
  return (await readLocalDocument<T>(key))?.value as T | undefined;
}

export async function writeAutomergeValue<T>(
  key: string,
  value: T,
  remoteBytes: Uint8Array | undefined,
) {
  await initializeAutomerge();
  let doc =
    (await mergeWithLocalDocument<T>(key, remoteBytes)) ||
    Automerge.from<SyncDocument<T>>({});
  doc = Automerge.change(doc, `Set ${key}`, (draft) => {
    reconcileProperty(draft, "value", value);
  });
  const bytes = Automerge.save(doc);
  await writeLocalDocument(key, doc, bytes);
  return { bytes, value: doc.value as T | undefined };
}

function initializeAutomerge() {
  automergeReady ??= Automerge.initializeBase64Wasm(automergeWasmBase64);
  return automergeReady;
}

export async function removeLocalAutomergeDocument(key: string) {
  documentCache.delete(key);
  await getBrowserApi().storage.local.remove(automergeLocalCacheKey(key));
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function mergeWithLocalDocument<T>(
  key: string,
  remoteBytes: Uint8Array | undefined,
) {
  const localDoc = await readLocalDocument<T>(key);
  const remoteDoc = remoteBytes ? loadDocument<T>(remoteBytes) : undefined;
  const doc =
    localDoc && remoteDoc
      ? Automerge.merge(localDoc, remoteDoc)
      : localDoc || remoteDoc;
  if (doc) await writeLocalDocument(key, doc);
  return doc;
}

async function readLocalDocument<T>(key: string) {
  const cached = documentCache.get(key) as
    | Automerge.Doc<SyncDocument<T>>
    | undefined;
  if (cached) return cached;
  const result = await getBrowserApi().storage.local.get(
    automergeLocalCacheKey(key),
  );
  const encoded = result[automergeLocalCacheKey(key)] as string | undefined;
  if (!encoded) return undefined;
  const doc = loadDocument<T>(base64ToBytes(encoded));
  documentCache.set(key, doc as Automerge.Doc<SyncDocument>);
  return doc;
}

async function writeLocalDocument<T>(
  key: string,
  doc: Automerge.Doc<SyncDocument<T>>,
  bytes = Automerge.save(doc),
) {
  documentCache.set(key, doc as Automerge.Doc<SyncDocument>);
  await getBrowserApi().storage.local.set({
    [automergeLocalCacheKey(key)]: bytesToBase64(bytes),
  });
}

function loadDocument<T>(bytes: Uint8Array) {
  return Automerge.load<SyncDocument<T>>(bytes);
}

function reconcileProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
) {
  if (value === undefined) {
    delete target[key];
    return;
  }
  if (Object.is(target[key], value)) return;
  if (!canReconcile(target[key], value)) {
    target[key] = cloneForAutomerge(value);
    return;
  }
  reconcileContainer(target[key], value);
}

function reconcileContainer(target: unknown, value: unknown) {
  if (Array.isArray(target) && Array.isArray(value)) {
    const list = target as AutomergeList;
    while (list.length > value.length) list.deleteAt(list.length - 1);
    for (let index = 0; index < value.length; index += 1) {
      if (index >= list.length)
        list.insertAt(index, cloneForAutomerge(value[index]));
      else reconcileArrayItem(list, index, value[index]);
    }
    return;
  }

  if (isPlainObject(target) && isPlainObject(value)) {
    for (const key of Object.keys(target)) {
      if (!(key in value)) delete target[key];
    }
    for (const [key, nextValue] of Object.entries(value))
      reconcileProperty(target, key, nextValue);
  }
}

type AutomergeList = unknown[] & {
  deleteAt(index: number): void;
  insertAt(index: number, value: unknown): void;
};

function reconcileArrayItem(
  target: AutomergeList,
  index: number,
  value: unknown,
) {
  if (!canReconcile(target[index], value)) {
    target[index] = cloneForAutomerge(value);
    return;
  }
  reconcileContainer(target[index], value);
}

function canReconcile(current: unknown, next: unknown) {
  return (
    (Array.isArray(current) && Array.isArray(next)) ||
    (isPlainObject(current) && isPlainObject(next))
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array)
  );
}

function cloneForAutomerge(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneForAutomerge);
  if (isPlainObject(value))
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [
          entryKey,
          cloneForAutomerge(entryValue),
        ]),
    );
  return value;
}

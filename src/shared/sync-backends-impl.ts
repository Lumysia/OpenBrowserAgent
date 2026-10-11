import * as config from "./config";
import { base64ToBytes, bytesToBase64 } from "./binary";
import { getBrowserApi } from "./browser-api";
import type { SyncBackendConfig } from "./types";
import {
  registerSyncBackendImpl,
  SYNC_BACKEND_TYPES,
  type SyncBackend,
  type SyncBackendImpl,
  type SyncItemRead,
} from "./sync-backends";
import {
  documentScope,
  readDocument,
  removeDocument,
  writeDocument,
  type DocumentTransport,
} from "./sync-documents";
import { createSplitCollectionStore, splitCollection } from "./sync-split";
import { valueCodec } from "./sync-tinybase-doc";
import {
  createWebDavTransport,
  readWebDavObject,
  removeWebDavObject,
  writeWebDavObject,
} from "./sync-webdav";

export function createSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  const transport =
    backendConfig.type === SYNC_BACKEND_TYPES.webDav
      ? createWebDavTransport(backendConfig)
      : createBrowserSyncTransport(backendConfig);
  // Values cross into callers that may mutate them; caches keep their own.
  const copy = <T>(value: unknown) => structuredClone(value) as T | undefined;
  const splitStore = (key: string) => {
    const collection = splitCollection(key);
    if (!collection?.lazy) throw new Error(`Not an item collection: ${key}`);
    return createSplitCollectionStore(transport, collection);
  };
  return serializeSyncBackend({
    config: backendConfig,
    async read<T>(key: string) {
      const collection = splitCollection(key);
      if (collection)
        return copy<T>(
          await createSplitCollectionStore(transport, collection).read(),
        );
      return copy<T>((await readDocument(transport, key, valueCodec)).value);
    },
    async write<T>(key: string, value: T) {
      const collection = splitCollection(key);
      if (collection)
        return copy<T>(
          await createSplitCollectionStore(transport, collection).write(value),
        );
      return copy<T>(
        (await writeDocument(transport, key, value as unknown, valueCodec))
          .value,
      );
    },
    async writeItems<T>(
      key: string,
      value: T,
      contents: Record<string, unknown>,
    ) {
      const result = await splitStore(key).writeItems(
        value,
        contents as Record<string, Record<string, unknown>>,
      );
      return copy<{ value?: T; contents: Record<string, unknown> }>(result)!;
    },
    async readItem(key, id, have) {
      return copy<SyncItemRead>(await splitStore(key).readItem(id, have))!;
    },
    async remove(key) {
      const collection = splitCollection(key);
      if (collection)
        await createSplitCollectionStore(transport, collection).remove();
      else await removeDocument(transport, key);
    },
    test: () => transport.test(),
  });
}

// Browser sync keeps each document as one storage.sync item. Writes cannot
// conflict there: the browser merges the sync area last-writer-wins.
function createBrowserSyncTransport(
  backendConfig: SyncBackendConfig,
): DocumentTransport {
  const area = () => getBrowserApi().storage.sync;
  return {
    config: backendConfig,
    peek: () => undefined,
    async get(name) {
      const encoded = (await area().get(name))[name] as string | undefined;
      return encoded ? { data: base64ToBytes(encoded) } : undefined;
    },
    async put(name, bytes) {
      const encoded = bytesToBase64(bytes);
      assertBrowserSyncItemFits(name, encoded);
      await area().set({ [name]: encoded });
      return { data: bytes };
    },
    remove: (name) => area().remove(name),
    async removeFolder(key) {
      const names = Object.keys(await area().get(null));
      const items = names.filter((name) => name.startsWith(`${key}/`));
      if (items.length) await area().remove(items);
    },
    async test() {
      await area().get(null);
    },
  };
}

function assertBrowserSyncItemFits(key: string, value: unknown) {
  const size = new TextEncoder().encode(
    JSON.stringify({ [key]: value }),
  ).length;
  if (size <= config.SYNC_MAX_BYTES_PER_ITEM) return;
  throw new Error(
    `Sync item exceeds the safe per-item limit: "${key}" is ${size} bytes; limit is ${config.SYNC_MAX_BYTES_PER_ITEM} bytes. Keep this data local or use a backend without browser quota limits.`,
  );
}

registerSyncBackendImpl({
  createSyncBackend,
  readWebDavObject,
  writeWebDavObject,
  removeWebDavObject,
} satisfies SyncBackendImpl);

// Per-key serialization
const operations = new Map<string, Promise<unknown>>();

// All extension contexts reach these adapters through the background. Serialize
// read/modify/write per key, including across freshly-created adapters.
function serializeSyncBackend(backend: SyncBackend): SyncBackend {
  function run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const scope = documentScope(backend.config, key);
    const previous = operations.get(scope) || Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    operations.set(scope, next);
    const cleanup = () => {
      if (operations.get(scope) === next) operations.delete(scope);
    };
    next.then(cleanup, cleanup);
    return next;
  }
  return {
    ...backend,
    read: <T>(key: string) => run(key, () => backend.read<T>(key)),
    write: <T>(key: string, value: T) =>
      run(key, () => backend.write(key, value)),
    writeItems: (key, value, contents) =>
      run(key, () => backend.writeItems(key, value, contents)),
    readItem: (key, id, have) =>
      run(key, () => backend.readItem(key, id, have)),
    remove: (key) => run(key, () => backend.remove(key)),
  };
}

// One object store per IndexedDB database. Each request opens the database,
// runs one transaction, and closes it again, so callers in the service worker
// and the side panel never hold a connection across awaits.
export function idbStore({
  database,
  store,
  keyPath,
  indexes = {},
}: {
  database: string;
  store: string;
  keyPath: string | string[];
  indexes?: Record<string, string>;
}) {
  return async function request<T>(
    mode: IDBTransactionMode,
    run: (objects: IDBObjectStore) => IDBRequest | void,
  ) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(database, 1);
      open.onupgradeneeded = () => {
        if (open.result.objectStoreNames.contains(store)) return;
        const objects = open.result.createObjectStore(store, { keyPath });
        for (const [name, path] of Object.entries(indexes))
          objects.createIndex(name, path);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const result = run(transaction.objectStore(store));
        transaction.oncomplete = () => resolve(result?.result as T);
        transaction.onerror = transaction.onabort = () =>
          reject(transaction.error || new Error(`${store} transaction failed`));
      });
    } finally {
      db.close();
    }
  };
}

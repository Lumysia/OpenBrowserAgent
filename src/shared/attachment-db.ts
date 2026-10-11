const DB_NAME = "openbrowseragent-chat-attachments";
const STORE_NAME = "attachments";
type RecordValue = {
  id: string;
  metadata: Record<string, unknown>;
  content: Uint8Array;
};

export function putAttachment(record: RecordValue) {
  return storeRequest<void>("readwrite", (store) => store.put(record));
}
export function getAttachment(id: string) {
  return storeRequest<RecordValue | undefined>("readonly", (store) =>
    store.get(id),
  );
}
export function deleteAttachment(id: string) {
  return storeRequest<void>("readwrite", (store) => store.delete(id));
}

async function storeRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result as T);
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error || new Error("Attachment transaction failed"));
    });
  } finally {
    db.close();
  }
}

const DB_NAME = "openbrowseragent-chat-attachments";
const STORE_NAME = "attachments";
type RecordValue = {
  id: string;
  metadata: Record<string, unknown>;
  content: Uint8Array;
};

export function putAttachment(record: RecordValue, signal?: AbortSignal) {
  return storeRequest<void>("readwrite", (store) => store.put(record), signal);
}
export function getAttachment(id: string, signal?: AbortSignal) {
  return storeRequest<RecordValue | undefined>(
    "readonly",
    (store) => store.get(id),
    signal,
  );
}
export function deleteAttachment(id: string, signal?: AbortSignal) {
  return storeRequest<void>("readwrite", (store) => store.delete(id), signal);
}

async function storeRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
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
    signal?.throwIfAborted();
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const abort = () => {
        try {
          transaction.abort();
        } catch {
          /* Already committed. */
        }
      };
      signal?.addEventListener("abort", abort, { once: true });
      const cleanup = () => signal?.removeEventListener("abort", abort);
      let result: T;
      transaction.oncomplete = () => {
        cleanup();
        resolve(result);
      };
      transaction.onerror = transaction.onabort = () => {
        cleanup();
        reject(
          signal?.aborted
            ? signal.reason
            : transaction.error || new Error("Attachment transaction failed"),
        );
      };
      try {
        const request = run(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => {
          result = request.result as T;
        };
      } catch (error) {
        cleanup();
        transaction.abort();
        reject(error);
      }
    });
  } finally {
    db.close();
  }
}

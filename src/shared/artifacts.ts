import { idbStore } from "./idb-store";

// Full tool outputs that the model sees only as a preview or a one-line stub.
// `label` names the source (tool and key arguments) for stubs and `read`.
export type Artifact = {
  chatId: string;
  handle: string;
  label: string;
  text: string;
  createdAt: number;
};

export type ArtifactStore = {
  put(artifact: Artifact): Promise<void>;
  get(chatId: string, handle: string): Promise<Artifact | undefined>;
};

const request = idbStore({
  database: "openbrowseragent-artifacts",
  store: "artifacts",
  keyPath: ["chatId", "handle"],
  indexes: { chatId: "chatId" },
});

export const indexedDbArtifacts: ArtifactStore = {
  put: (artifact) => request<void>("readwrite", (store) => store.put(artifact)),
  get: (chatId, handle) =>
    request<Artifact | undefined>("readonly", (store) =>
      store.get([chatId, handle]),
    ),
};

export function deleteChatArtifacts(chatIds: string[]) {
  return request<void>("readwrite", (store) => {
    const index = store.index("chatId");
    for (const chatId of chatIds)
      index.openKeyCursor(IDBKeyRange.only(chatId)).onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursor | null>).result;
        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
  });
}

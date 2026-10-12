import { idbStore } from "./idb-store";

type RecordValue = {
  id: string;
  metadata: Record<string, unknown>;
  content: Uint8Array;
};

const request = idbStore({
  database: "openbrowseragent-chat-attachments",
  store: "attachments",
  keyPath: "id",
});

export function putAttachment(record: RecordValue) {
  return request<void>("readwrite", (store) => store.put(record));
}
export function getAttachment(id: string) {
  return request<RecordValue | undefined>("readonly", (store) => store.get(id));
}
export function deleteAttachment(id: string) {
  return request<void>("readwrite", (store) => store.delete(id));
}

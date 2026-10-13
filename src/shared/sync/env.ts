// Everything the sync engine touches outside itself, so one process can run
// several devices in tests and the background passes the browser's APIs.

export type StorageArea = {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  getBytesInUse?(keys?: string | string[] | null): Promise<number>;
};

export type StoredAttachment = {
  id: string;
  metadata: Record<string, unknown>;
  content: Uint8Array;
};

export type AttachmentStore = {
  get(id: string): Promise<StoredAttachment | undefined>;
  put(record: StoredAttachment): Promise<void>;
  delete(id: string): Promise<void>;
};

export type SyncEnv = {
  local: StorageArea;
  // The browser account's sync area (the browser-sync backend).
  sync: StorageArea;
  attachments: AttachmentStore;
  fetch: typeof fetch;
  now(): number;
  // Serializes read-modify-write of a storage key with the extension pages.
  lock<T>(name: string, run: () => Promise<T>): Promise<T>;
  // Whether a reply of this chat is streaming in this background now.
  runActive?(chatId: string): boolean;
  // Removes what belongs to deleted chats outside storage (tool outputs).
  removeChatArtifacts?(chatIds: string[]): Promise<void>;
  // Resolves once the edit listener recorded every storage change made
  // before the call (see track.ts).
  settleEdits?(): Promise<void>;
};

export async function readKey<T>(area: StorageArea, key: string) {
  return (await area.get(key))[key] as T | undefined;
}

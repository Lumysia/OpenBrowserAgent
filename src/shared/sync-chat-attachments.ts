import {
  ATTACHMENT_KIND,
  base64FromDataUrl,
  toAttachmentMetadata,
} from "./attachments";
import { getBrowserApi } from "./browser-api";
import {
  getActiveSyncBackend,
  readSyncBackendObject,
  removeSyncBackendObject,
  syncBackendSupportsChatAttachments,
  writeSyncBackendObject,
  type SyncBackend,
} from "./sync-backends";
import {
  mergeSyncDataSettings,
  SYNC_DATA_SETTING_KEYS,
  type SyncDataSettings,
} from "./sync-data-settings";
import { STORAGE_KEYS } from "./storage-keys";
import type { Chat, UploadedAttachment } from "./types";

const CHAT_ATTACHMENT_ROOT = "attachments";
const CHAT_ATTACHMENT_PREFIX = "chat-attachment";
const CHAT_ATTACHMENT_DB = "openbrowseragent-chat-attachments";
const CHAT_ATTACHMENT_STORE = "attachments";

type SyncedChatAttachmentMetadata = Omit<
  UploadedAttachment,
  "dataUrl" | "text"
> & {
  version: 1;
  chatId: string;
  messageId: string;
  objectName: string;
  createdAt: number;
};

export async function writeSyncedChatAttachments({
  syncDataSettings,
  chatId,
  messageId,
  attachments,
}: {
  syncDataSettings?: SyncDataSettings;
  chatId: string;
  messageId: string;
  attachments: UploadedAttachment[];
}) {
  if (!attachments.length) return;
  await Promise.all(
    attachments.map((attachment) =>
      writeLocalChatAttachment({ chatId, messageId, attachment }),
    ),
  );
  const backend = await activeAttachmentBackend(syncDataSettings);
  if (!backend) return;
  await Promise.all(
    attachments.map((attachment) =>
      writeRemoteChatAttachment({
        backend,
        chatId,
        messageId,
        attachment,
      }),
    ),
  );
}

export async function readSyncedChatAttachment(
  syncDataSettings: SyncDataSettings | undefined,
  attachmentId: string,
) {
  const local = await readLocalChatAttachment(attachmentId);
  if (local) return local;
  const backend = await activeAttachmentBackend(syncDataSettings);
  if (!backend) return undefined;
  const metadataBytes = await readSyncBackendObject(
    backend,
    metadataObjectName(attachmentId),
  );
  if (!metadataBytes) return undefined;
  const metadata = JSON.parse(
    new TextDecoder().decode(metadataBytes),
  ) as SyncedChatAttachmentMetadata;
  const contentBytes = await readSyncBackendObject(
    backend,
    metadata.objectName,
  );
  if (!contentBytes) return metadata;
  return attachmentFromBytes(metadata, contentBytes);
}

export async function removeSyncedChatAttachments(
  syncDataSettings: SyncDataSettings | undefined,
  chats: Chat[],
) {
  const attachments = chats.flatMap(chatAttachmentMetadata);
  if (!attachments.length) return;
  await Promise.all(
    attachments.map((attachment) => removeLocalChatAttachment(attachment.id)),
  );
  const backend = await activeAttachmentBackend(syncDataSettings);
  if (!backend) return;
  await Promise.all(
    attachments.map(async (attachment) => {
      const metadataBytes = await readSyncBackendObject(
        backend,
        metadataObjectName(attachment.id),
      );
      const metadata = metadataBytes
        ? (JSON.parse(
            new TextDecoder().decode(metadataBytes),
          ) as SyncedChatAttachmentMetadata)
        : undefined;
      await Promise.all([
        metadata?.objectName
          ? removeSyncBackendObject(backend, metadata.objectName)
          : Promise.resolve(),
        removeSyncBackendObject(backend, metadataObjectName(attachment.id)),
      ]);
    }),
  );
}

export async function offloadChatInlineAttachments(chats: Chat[]) {
  const writes: Array<Promise<void>> = [];
  const nextChats = chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map((message) => ({
      ...message,
      parts: message.parts?.map((part) => ({
        ...part,
        output: offloadInlineRecord({
          value: part.output,
          chatId: chat.id,
          messageId: message.id,
          writes,
        }),
      })),
    })),
  }));
  await Promise.all(writes);
  return nextChats;
}

async function writeRemoteChatAttachment({
  backend,
  chatId,
  messageId,
  attachment,
}: {
  backend: SyncBackend;
  chatId: string;
  messageId: string;
  attachment: UploadedAttachment;
}) {
  const objectName = attachmentObjectName(attachment);
  const metadata: SyncedChatAttachmentMetadata = {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    kind: attachment.kind,
    version: 1,
    chatId,
    messageId,
    objectName,
    createdAt: Date.now(),
  };
  await writeSyncBackendObject(
    backend,
    objectName,
    attachmentBytes(attachment),
    attachment.type || "application/octet-stream",
  );
  await writeSyncBackendObject(
    backend,
    metadataObjectName(attachment.id),
    new TextEncoder().encode(JSON.stringify(metadata, null, 2)),
    "application/json",
  );
  await removeLocalChatAttachment(attachment.id);
}

async function writeLocalChatAttachment({
  chatId,
  messageId,
  attachment,
}: {
  chatId: string;
  messageId: string;
  attachment: UploadedAttachment;
}) {
  const metadata = {
    ...toAttachmentMetadata(attachment),
    version: 1,
    chatId,
    messageId,
    createdAt: Date.now(),
  };
  const db = await openAttachmentDb();
  await putInStore(db, {
    id: attachment.id,
    metadata,
    content: attachmentBytes(attachment),
  });
}

async function readLocalChatAttachment(attachmentId: string) {
  const db = await openAttachmentDb();
  const record = await getFromStore(db, attachmentId);
  if (!record) return undefined;
  const metadata = record.metadata as SyncedChatAttachmentMetadata;
  return attachmentFromBytes(metadata, record.content);
}

async function removeLocalChatAttachment(attachmentId: string) {
  const db = await openAttachmentDb();
  await deleteFromStore(db, attachmentId);
}

function offloadInlineRecord({
  value,
  chatId,
  messageId,
  writes,
}: {
  value: unknown;
  chatId: string;
  messageId: string;
  writes: Array<Promise<void>>;
}): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const image = typeof record.image === "string" ? record.image : "";
  const visionImage = record._visionImage as
    | { dataUrl?: unknown; type?: unknown }
    | undefined;
  const dataUrl = dataImageUrl(image) || dataImageUrl(visionImage?.dataUrl);
  if (!dataUrl) return value;
  const type =
    (typeof visionImage?.type === "string" && visionImage.type) ||
    dataUrl.match(/^data:([^;,]+)/)?.[1] ||
    "image/png";
  const id = `tool-image-${crypto.randomUUID()}`;
  const attachment: UploadedAttachment = {
    id,
    name: `${String(record.format || "image")}.${type.split("/")[1] || "png"}`,
    type,
    size: dataUrlSize(dataUrl),
    kind: ATTACHMENT_KIND.image,
    dataUrl,
  };
  writes.push(
    writeSyncedChatAttachments({
      chatId,
      messageId,
      attachments: [attachment],
    }),
  );
  const { image: _image, _visionImage, ...rest } = record;
  return {
    ...rest,
    imageAttachmentId: id,
    imageAttachmentName: attachment.name,
    imageAttachmentType: attachment.type,
    imageAttachmentSize: attachment.size,
    imageStored: true,
  };
}

function dataImageUrl(value: unknown) {
  return typeof value === "string" && value.startsWith("data:image/")
    ? value
    : "";
}

function dataUrlSize(dataUrl: string) {
  return Math.ceil((base64FromDataUrl(dataUrl).length * 3) / 4);
}

async function activeAttachmentBackend(
  syncDataSettings: SyncDataSettings | undefined,
) {
  const settings = await currentSyncDataSettings(syncDataSettings);
  if (!settings?.[SYNC_DATA_SETTING_KEYS.chatAttachments]) return undefined;
  const backend = await getActiveSyncBackend().catch(() => undefined);
  return backend && syncBackendSupportsChatAttachments(backend.config.type)
    ? backend
    : undefined;
}

async function currentSyncDataSettings(fallback: SyncDataSettings | undefined) {
  const result = await getBrowserApi().storage.sync.get(
    STORAGE_KEYS.syncDataSettings,
  );
  const value = result[STORAGE_KEYS.syncDataSettings] as
    | Partial<SyncDataSettings>
    | undefined;
  return value ? mergeSyncDataSettings(value) : fallback;
}

function attachmentFromBytes(
  metadata: SyncedChatAttachmentMetadata,
  bytes: Uint8Array,
): UploadedAttachment {
  const { version, chatId, messageId, objectName, createdAt, ...attachment } =
    metadata;
  if (metadata.kind === "text")
    return { ...attachment, text: new TextDecoder().decode(bytes) };
  return { ...attachment, dataUrl: bytesToDataUrl(bytes, metadata.type) };
}

function chatAttachmentMetadata(chat: Chat) {
  return chat.messages.flatMap((message) =>
    Array.isArray(message.metadata?.uploadedAttachments)
      ? (message.metadata.uploadedAttachments as UploadedAttachment[])
      : [],
  );
}

function attachmentBytes(attachment: UploadedAttachment) {
  if (attachment.text !== undefined)
    return new TextEncoder().encode(attachment.text);
  if (!attachment.dataUrl) return new Uint8Array();
  return base64ToBytes(base64FromDataUrl(attachment.dataUrl));
}

function bytesToDataUrl(bytes: Uint8Array, type: string) {
  return `data:${type || "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return btoa(binary);
}

function metadataObjectName(attachmentId: string) {
  return `${CHAT_ATTACHMENT_ROOT}/${CHAT_ATTACHMENT_PREFIX}-${attachmentId}.json`;
}

function attachmentObjectName(attachment: UploadedAttachment) {
  const safeName = attachment.name.replace(/[^a-z0-9._-]+/gi, "_") || "file";
  return `${CHAT_ATTACHMENT_ROOT}/${currentMonthFolder()}/${CHAT_ATTACHMENT_PREFIX}-${attachment.id}-${safeName}`;
}

function currentMonthFolder() {
  return new Date().toISOString().slice(0, 7);
}

type StoredAttachmentRecord = {
  id: string;
  metadata: Record<string, unknown>;
  content: Uint8Array;
};

function openAttachmentDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CHAT_ATTACHMENT_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHAT_ATTACHMENT_STORE))
        db.createObjectStore(CHAT_ATTACHMENT_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putInStore(db: IDBDatabase, record: StoredAttachmentRecord) {
  return storeRequest(db, "readwrite", (store) => store.put(record));
}

function getFromStore(db: IDBDatabase, id: string) {
  return storeRequest<StoredAttachmentRecord | undefined>(
    db,
    "readonly",
    (store) => store.get(id),
  );
}

function deleteFromStore(db: IDBDatabase, id: string) {
  return storeRequest(db, "readwrite", (store) => store.delete(id));
}

function storeRequest<T = void>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
) {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(CHAT_ATTACHMENT_STORE, mode);
    const request = run(transaction.objectStore(CHAT_ATTACHMENT_STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

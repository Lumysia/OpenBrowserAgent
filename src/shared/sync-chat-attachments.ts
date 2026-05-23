import { base64FromDataUrl } from "./attachments";
import * as config from "./config";
import {
  getActiveSyncBackend,
  removeWebDavObject,
  readWebDavObject,
  writeWebDavObject,
  type WebDavSyncBackendConfig,
} from "./sync-backends";
import type { SyncDataSettings } from "./sync-data-settings";
import type { Chat, UploadedAttachment } from "./types";

const CHAT_ATTACHMENT_ROOT = "attachments";
const CHAT_ATTACHMENT_PREFIX = "chat-attachment";

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

const pendingAttachmentWrites = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

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
  const backendConfig = await activeWebDavAttachmentBackend(syncDataSettings);
  if (!backendConfig) return;

  for (const attachment of attachments) {
    const pending = pendingAttachmentWrites.get(attachment.id);
    if (pending) clearTimeout(pending);
    pendingAttachmentWrites.set(
      attachment.id,
      setTimeout(() => {
        pendingAttachmentWrites.delete(attachment.id);
        writeSyncedChatAttachment({
          backendConfig,
          chatId,
          messageId,
          attachment,
        }).catch((error) =>
          console.warn("Failed to sync chat attachment", error),
        );
      }, config.CHAT_SYNC_WRITE_DEBOUNCE_MS),
    );
  }
}

export async function readSyncedChatAttachment(
  syncDataSettings: SyncDataSettings | undefined,
  attachmentId: string,
) {
  const backendConfig = await activeWebDavAttachmentBackend(syncDataSettings);
  if (!backendConfig) return undefined;
  const metadataBytes = await readWebDavObject(
    backendConfig,
    metadataObjectName(attachmentId),
  );
  if (!metadataBytes) return undefined;
  const metadata = JSON.parse(
    new TextDecoder().decode(metadataBytes),
  ) as SyncedChatAttachmentMetadata;
  const contentBytes = await readWebDavObject(
    backendConfig,
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
  const backendConfig = await activeWebDavAttachmentBackend(syncDataSettings);
  if (!backendConfig) return;
  await Promise.all(
    attachments.map(async (attachment) => {
      const pending = pendingAttachmentWrites.get(attachment.id);
      if (pending) {
        clearTimeout(pending);
        pendingAttachmentWrites.delete(attachment.id);
      }
      const metadataBytes = await readWebDavObject(
        backendConfig,
        metadataObjectName(attachment.id),
      );
      const metadata = metadataBytes
        ? (JSON.parse(
            new TextDecoder().decode(metadataBytes),
          ) as SyncedChatAttachmentMetadata)
        : undefined;
      await Promise.all([
        metadata?.objectName
          ? removeWebDavObject(backendConfig, metadata.objectName)
          : Promise.resolve(),
        removeWebDavObject(backendConfig, metadataObjectName(attachment.id)),
      ]);
    }),
  );
}

async function writeSyncedChatAttachment({
  backendConfig,
  chatId,
  messageId,
  attachment,
}: {
  backendConfig: WebDavSyncBackendConfig;
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
  await writeWebDavObject(
    backendConfig,
    objectName,
    attachmentBytes(attachment),
    attachment.type || "application/octet-stream",
  );
  await writeWebDavObject(
    backendConfig,
    metadataObjectName(attachment.id),
    new TextEncoder().encode(JSON.stringify(metadata, null, 2)),
    "application/json",
  );
}

async function activeWebDavAttachmentBackend(
  syncDataSettings: SyncDataSettings | undefined,
) {
  if (!syncDataSettings?.syncChatAttachments) return undefined;
  const backend = await getActiveSyncBackend().catch(() => undefined);
  return backend?.config.type === "webdav" ? backend.config : undefined;
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

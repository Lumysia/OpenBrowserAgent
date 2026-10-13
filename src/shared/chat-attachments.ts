import {
  ATTACHMENT_KIND,
  base64FromDataUrl,
  toAttachmentMetadata,
} from "./attachments";
import {
  deleteAttachment,
  getAttachment,
  putAttachment,
} from "./attachment-db";
import { bytesToBase64, base64ToBytes } from "./binary";
import { getBrowserApi } from "./browser-api";
import { chatContent } from "./chats";
import { storageLockName, withLock } from "./locks";
import { STORAGE_KEYS } from "./storage-keys";
import { loadSyncedContent } from "./sync/client";
import type { ChatContent, ChatSummary, UploadedAttachment } from "./types";

export { chatAttachmentIds } from "./chat-attachment-ids";

// Chat attachments live in IndexedDB; an index of their metadata in storage
// (`chat-attachments`) says which exist, and is what sync compares. Bytes of
// attachments synced from another device are downloaded when first shown.

type AttachmentMetadata = Omit<UploadedAttachment, "dataUrl" | "text"> & {
  version: 1;
  chatId: string;
  messageId: string;
  createdAt: number;
};

const INDEX = STORAGE_KEYS.chatAttachments;
const offloadedInlineAttachmentWrites = new Map<string, Promise<void>>();

const local = () => getBrowserApi().storage.local;

function updateIndex(
  update: (index: Record<string, AttachmentMetadata>) => void,
) {
  return withLock(storageLockName(INDEX), async () => {
    const index = {
      ...((await local().get(INDEX))[INDEX] as
        Record<string, AttachmentMetadata> | undefined),
    };
    update(index);
    await local().set({ [INDEX]: index });
  });
}

export async function writeChatAttachments({
  chatId,
  messageId,
  attachments,
  signal,
}: {
  chatId: string;
  messageId: string;
  attachments: UploadedAttachment[];
  signal?: AbortSignal;
}) {
  signal?.throwIfAborted();
  if (!attachments.length) return;
  const records = attachments.map((attachment) => ({
    id: attachment.id,
    metadata: {
      ...toAttachmentMetadata(attachment),
      version: 1,
      chatId,
      messageId,
      createdAt: Date.now(),
    } as AttachmentMetadata,
    content: attachmentBytes(attachment),
  }));
  await Promise.all(records.map((record) => putAttachment(record)));
  await updateIndex((index) => {
    for (const record of records) index[record.id] = record.metadata;
  });
}

// This device's copy, else the synced copy downloaded now.
export async function readChatAttachment(
  attachmentId: string,
  signal?: AbortSignal,
) {
  const stored = await getAttachment(attachmentId);
  signal?.throwIfAborted();
  if (stored)
    return attachmentFromBytes(
      stored.metadata as AttachmentMetadata,
      stored.content,
    );
  const index = (await local().get(INDEX))[INDEX] as
    Record<string, AttachmentMetadata> | undefined;
  if (!index?.[attachmentId]) return undefined;
  await loadSyncedContent("attachments", attachmentId).catch(() => undefined);
  signal?.throwIfAborted();
  const loaded = await getAttachment(attachmentId);
  return loaded
    ? attachmentFromBytes(loaded.metadata as AttachmentMetadata, loaded.content)
    : index[attachmentId];
}

// Attachments of removed chats that no retained chat refers to.
export async function removeChatAttachments(
  chats: ChatSummary[],
  retainedChats: ChatSummary[] = [],
) {
  const retainedIds = new Set(
    retainedChats.flatMap((chat) => chat.attachmentIds || []),
  );
  const attachmentIds = [
    ...new Set(chats.flatMap((chat) => chat.attachmentIds || [])),
  ].filter((id) => !retainedIds.has(id));
  if (!attachmentIds.length) return;
  attachmentIds.forEach((id) => offloadedInlineAttachmentWrites.delete(id));
  await updateIndex((index) => {
    for (const id of attachmentIds) delete index[id];
  });
  await Promise.all(attachmentIds.map((id) => deleteAttachment(id)));
}

export async function offloadChatInlineAttachments(
  chatId: string,
  content: ChatContent,
): Promise<ChatContent> {
  const writes: Array<Promise<void>> = [];
  const next = {
    ...chatContent(content),
    messages: content.messages.map((message) => ({
      ...message,
      parts: message.parts?.map((part) => ({
        ...part,
        output: offloadInlineRecord({
          value: part.output,
          chatId,
          messageId: message.id,
          partId: part.id,
          writes,
        }),
      })),
    })),
  };
  await Promise.all(writes);
  return next;
}

function offloadInlineRecord({
  value,
  chatId,
  messageId,
  partId,
  writes,
}: {
  value: unknown;
  chatId: string;
  messageId: string;
  partId: string;
  writes: Array<Promise<void>>;
}): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const image = typeof record.image === "string" ? record.image : "";
  const visionImage = record._visionImage as
    { dataUrl?: unknown; type?: unknown } | undefined;
  const dataUrl = dataImageUrl(image) || dataImageUrl(visionImage?.dataUrl);
  if (!dataUrl) return value;
  const type =
    (typeof visionImage?.type === "string" && visionImage.type) ||
    dataUrl.match(/^data:([^;,]+)/)?.[1] ||
    "image/png";
  const id =
    typeof record.imageAttachmentId === "string" && record.imageAttachmentId
      ? record.imageAttachmentId
      : stableToolAttachmentId(chatId, messageId, partId);
  const attachment: UploadedAttachment = {
    id,
    name:
      typeof record.imageAttachmentName === "string" &&
      record.imageAttachmentName
        ? record.imageAttachmentName
        : `${String(record.format || "image")}.${type.split("/")[1] || "png"}`,
    type,
    size: dataUrlSize(dataUrl),
    kind: ATTACHMENT_KIND.image,
    dataUrl,
  };
  writes.push(writeInlineAttachmentOnce(chatId, messageId, attachment));
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

function stableToolAttachmentId(
  chatId: string,
  messageId: string,
  partId: string,
) {
  return `tool-attachment-${hashText(`${chatId}\u001f${messageId}\u001f${partId}`)}`;
}

function writeInlineAttachmentOnce(
  chatId: string,
  messageId: string,
  attachment: UploadedAttachment,
) {
  const existing = offloadedInlineAttachmentWrites.get(attachment.id);
  if (existing) return existing;
  const write = writeChatAttachments({
    chatId,
    messageId,
    attachments: [attachment],
  }).catch((error) => {
    offloadedInlineAttachmentWrites.delete(attachment.id);
    throw error;
  });
  offloadedInlineAttachmentWrites.set(attachment.id, write);
  return write;
}

function hashText(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

function dataUrlSize(dataUrl: string) {
  return Math.ceil((base64FromDataUrl(dataUrl).length * 3) / 4);
}

function attachmentFromBytes(
  metadata: AttachmentMetadata,
  bytes: Uint8Array,
): UploadedAttachment {
  const { version, chatId, messageId, createdAt, ...attachment } = metadata;
  const content = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (metadata.kind === "text")
    return { ...attachment, text: new TextDecoder().decode(content) };
  return { ...attachment, dataUrl: bytesToDataUrl(content, metadata.type) };
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

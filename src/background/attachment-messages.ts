import {
  ATTACHMENT_KIND,
  ATTACHMENT_OUTPUT_NOTE,
  ATTACHMENT_TOOL_ERROR,
  base64FromDataUrl,
} from "../shared/attachments";
import {
  READ_ATTACHMENT_DEFAULT_LIMIT,
  READ_ATTACHMENT_MAX_LIMIT,
} from "../shared/config";
import type {
  AgentWorkspace,
  ChatMessage,
  Skill,
  UploadedAttachment,
} from "../shared/types";
import {
  getUploadedAttachments,
  renderAttachmentContext,
  renderUserMessageWithContext,
} from "./message-helpers";
import { readSyncedChatAttachment } from "../shared/sync-chat-attachments";

export async function readUploadedAttachment(
  attachments: UploadedAttachment[],
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const attachmentId = String(input.attachmentId || input.id || "");
  const offset = clampReadOffset(input.offset);
  const limit = clampReadLimit(input.limit);
  const format = String(input.format || "");
  const attachment =
    attachments.find((item) => item.id === attachmentId) ||
    (await readSyncedChatAttachment(undefined, attachmentId, signal));
  if (!attachment)
    return { error: ATTACHMENT_TOOL_ERROR.notFound, attachmentId };
  if (attachment.kind === ATTACHMENT_KIND.text) {
    const text = attachmentText(attachment);
    if (text === undefined)
      return { error: "Attachment content not available", attachmentId };
    return withSlice(
      {
        id: attachment.id,
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        kind: attachment.kind,
        encoding: "text",
      },
      text,
      offset,
      limit,
      "text",
    );
  }

  const dataUrl = attachmentDataUrl(attachment);
  if (dataUrl === undefined)
    return { error: "Attachment content not available", attachmentId };
  const base64 = base64FromDataUrl(dataUrl);
  const encoding = format === "hex" ? "hex" : "base64";
  if (encoding === "hex")
    return withPreSliced(
      {
        id: attachment.id,
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        kind: attachment.kind,
        encoding,
        note: noteForAttachment(attachment),
      },
      readBase64AsHex(base64, offset, limit),
      offset,
      limit,
      encoding,
      Math.ceil((base64.length * 3) / 4) * 2,
    );
  return withSlice(
    {
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      kind: attachment.kind,
      encoding,
      note: noteForAttachment(attachment),
    },
    base64,
    offset,
    limit,
    encoding,
  );
}

function attachmentText(attachment: object) {
  const text = (attachment as { text?: unknown }).text;
  return typeof text === "string" ? text : undefined;
}

function attachmentDataUrl(attachment: object) {
  const dataUrl = (attachment as { dataUrl?: unknown }).dataUrl;
  return typeof dataUrl === "string" ? dataUrl : undefined;
}

export function renderMessageText(
  message: ChatMessage,
  isLatest: boolean,
  requestAttachments: UploadedAttachment[],
  availableSkills: Skill[] = [],
  workspace?: AgentWorkspace,
) {
  if (isLatest && message.role === "user")
    return renderUserMessageWithContext(
      message,
      requestAttachments,
      availableSkills,
      workspace,
    );
  const attachmentContext = renderAttachmentContext(
    getUploadedAttachments(message),
  );
  return attachmentContext
    ? `${message.content}\n\n${attachmentContext}`
    : message.content;
}

function withSlice(
  metadata: Record<string, unknown>,
  content: string,
  offset: number,
  limit: number,
  field: string,
  totalLength = content.length,
) {
  return {
    ...metadata,
    offset,
    limit,
    totalLength,
    truncated: offset + limit < totalLength,
    [field]: content.slice(offset, offset + limit),
  };
}

function withPreSliced(
  metadata: Record<string, unknown>,
  slice: string,
  offset: number,
  limit: number,
  field: string,
  totalLength: number,
) {
  return {
    ...metadata,
    offset,
    limit,
    totalLength,
    truncated: offset + limit < totalLength,
    [field]: slice,
  };
}

function clampReadOffset(value: unknown) {
  const offset = Number(value);
  return Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
}

function clampReadLimit(value: unknown) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return READ_ATTACHMENT_DEFAULT_LIMIT;
  return Math.min(READ_ATTACHMENT_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

function readBase64AsHex(base64: string, hexOffset: number, hexLimit: number) {
  const byteStart = Math.floor(hexOffset / 2);
  const byteEnd = Math.ceil((hexOffset + hexLimit) / 2);
  const base64Start = Math.floor(byteStart / 3) * 4;
  const base64End = Math.ceil(byteEnd / 3) * 4;
  const binary = atob(base64.slice(base64Start, base64End));
  const skippedBytes = byteStart - Math.floor(base64Start / 4) * 3;
  const neededBytes = byteEnd - byteStart;
  const window = binary.slice(skippedBytes, skippedBytes + neededBytes);
  return Array.from(window, (char) =>
    char.charCodeAt(0).toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(hexOffset % 2, (hexOffset % 2) + hexLimit);
}

function noteForAttachment(attachment: UploadedAttachment) {
  if (
    attachment.kind === ATTACHMENT_KIND.audio ||
    attachment.kind === ATTACHMENT_KIND.video
  )
    return ATTACHMENT_OUTPUT_NOTE.media;
  if (attachment.kind === ATTACHMENT_KIND.document)
    return ATTACHMENT_OUTPUT_NOTE.document;
  return ATTACHMENT_OUTPUT_NOTE.binary;
}

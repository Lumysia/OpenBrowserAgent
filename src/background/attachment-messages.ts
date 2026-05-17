import {
  ATTACHMENT_KIND,
  ATTACHMENT_OUTPUT_NOTE,
  ATTACHMENT_TOOL_ERROR,
} from "../shared/attachments";
import {
  READ_ATTACHMENT_DEFAULT_LIMIT,
  READ_ATTACHMENT_MAX_LIMIT,
} from "../shared/config";
import type { ChatMessage, Skill, UploadedAttachment } from "../shared/types";
import {
  getUploadedAttachments,
  renderAttachmentContext,
  renderUserMessageWithContext,
} from "./message-helpers";

export function createGeminiContents(
  messages: ChatMessage[],
  multimodal: boolean,
  requestAttachments: UploadedAttachment[] = [],
  availableSkills: Skill[] = [],
) {
  return messages.map((message, index) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: createGeminiParts(
      message,
      index === messages.length - 1,
      multimodal,
      index === messages.length - 1 ? requestAttachments : [],
      index === messages.length - 1 ? availableSkills : [],
    ),
  }));
}

export function createOpenAIRequestMessages(
  system: string,
  messages: ChatMessage[],
  multimodal: boolean,
  requestAttachments: UploadedAttachment[] = [],
  availableSkills: Skill[] = [],
) {
  return [
    { role: "system", content: system },
    ...messages.map((message, index) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: createOpenAIMessageContent(
        message,
        index === messages.length - 1,
        multimodal,
        index === messages.length - 1 ? requestAttachments : [],
        index === messages.length - 1 ? availableSkills : [],
      ),
    })),
  ];
}

export function hasImageAttachments(attachments: UploadedAttachment[]) {
  return false;
}

export function readUploadedAttachment(
  attachments: UploadedAttachment[],
  input: Record<string, unknown>,
) {
  const attachmentId = String(input.attachmentId || input.id || "");
  const offset = clampReadOffset(input.offset);
  const limit = clampReadLimit(input.limit);
  const format = String(input.format || "");
  const attachment = attachments.find((item) => item.id === attachmentId);
  if (!attachment)
    return { error: ATTACHMENT_TOOL_ERROR.notFound, attachmentId };
  if (attachment.kind === ATTACHMENT_KIND.text)
    return withSlice(
      {
        id: attachment.id,
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        kind: attachment.kind,
        encoding: "text",
      },
      attachment.text || "",
      offset,
      limit,
      "text",
    );

  const base64 = base64FromDataUrl(attachment.dataUrl || "");
  const encoding = format === "hex" ? "hex" : "base64";
  if (encoding === "hex")
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
      readBase64AsHex(base64, offset, limit),
      0,
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

export function readSkill(skills: Skill[], input: Record<string, unknown>) {
  const skillId = String(input.skillId || input.id || "");
  const skill = skills.find((item) => item.id === skillId);
  if (!skill) return { error: "Skill not found", skillId };
  return {
    id: skill.id,
    title: skill.title,
    description: skill.description || "",
    mode: skill.mode || "",
    instruction: skill.instruction,
  };
}

function createGeminiParts(
  message: ChatMessage,
  isLatest: boolean,
  multimodal: boolean,
  requestAttachments: UploadedAttachment[],
  availableSkills: Skill[],
) {
  const attachments = requestAttachments.length
    ? requestAttachments
    : getUploadedAttachments(message);
  const parts: Array<Record<string, unknown>> = [
    {
      text: renderMessageText(
        message,
        isLatest,
        requestAttachments,
        availableSkills,
      ),
    },
  ];
  return parts;
}

function createOpenAIMessageContent(
  message: ChatMessage,
  isLatest: boolean,
  multimodal: boolean,
  requestAttachments: UploadedAttachment[],
  availableSkills: Skill[],
) {
  const text = renderMessageText(
    message,
    isLatest,
    requestAttachments,
    availableSkills,
  );
  const attachments = requestAttachments.length
    ? requestAttachments
    : getUploadedAttachments(message);
  return text;
}

function renderMessageText(
  message: ChatMessage,
  isLatest: boolean,
  requestAttachments: UploadedAttachment[],
  availableSkills: Skill[] = [],
) {
  if (isLatest && message.role === "user")
    return renderUserMessageWithContext(
      message,
      requestAttachments,
      availableSkills,
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

function clampReadOffset(value: unknown) {
  const offset = Number(value);
  return Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
}

function clampReadLimit(value: unknown) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return READ_ATTACHMENT_DEFAULT_LIMIT;
  return Math.min(READ_ATTACHMENT_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

function base64FromDataUrl(dataUrl: string) {
  return dataUrl.includes(",") ? dataUrl.split(",", 2)[1] || "" : dataUrl;
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

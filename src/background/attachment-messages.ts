import {
  ATTACHMENT_KIND,
  ATTACHMENT_OUTPUT_NOTE,
  ATTACHMENT_TOOL_ERROR,
  base64FromDataUrl,
  isVisionImageMimeType,
} from "../shared/attachments";
import {
  READ_ATTACHMENT_DEFAULT_LIMIT,
  READ_ATTACHMENT_MAX_LIMIT,
} from "../shared/config";
import type { ChatMessage, Skill, UploadedAttachment } from "../shared/types";
import { getSkillDisplayName, getSkillEntryFile } from "../shared/skills";
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
  return attachments.some(
    (attachment) =>
      attachment.kind === ATTACHMENT_KIND.image &&
      attachment.dataUrl &&
      isVisionImageMimeType(attachment.type),
  );
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
  const entry = getSkillEntryFile(skill);
  return {
    id: skill.id,
    name: getSkillDisplayName(skill),
    description: skill.description || "",
    entry: entry?.path || "SKILL.md",
    content: entry?.content || "",
    files: skill.files?.map((file) => ({
      path: file.path,
      kind: file.kind,
      size: file.content.length,
    })),
  };
}

export function listSkills(skills: Skill[]) {
  return {
    skills: skills.map((skill) => ({
      id: skill.id,
      name: getSkillDisplayName(skill),
      description: skill.description || "",
      entry: "SKILL.md",
      files: skill.files?.map((file) => ({
        path: file.path,
        kind: file.kind,
        size: file.content.length,
      })),
    })),
  };
}

export function readSkillFile(skills: Skill[], input: Record<string, unknown>) {
  const skillId = String(input.skillId || input.id || "");
  const path = String(input.path || "");
  const skill = skills.find((item) => item.id === skillId);
  if (!skill) return { error: "Skill not found", skillId };
  const file = skill.files?.find((item) => item.path === path);
  if (!file) return { error: "Skill file not found", skillId, path };
  return {
    id: skill.id,
    name: getSkillDisplayName(skill),
    path: file.path,
    kind: file.kind,
    content: file.content,
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
  if (multimodal)
    parts.push(
      ...attachments
        .filter(
          (attachment) =>
            attachment.kind === ATTACHMENT_KIND.image &&
            attachment.dataUrl &&
            isVisionImageMimeType(attachment.type),
        )
        .map((attachment) => ({
          inline_data: {
            mime_type: attachment.type || "image/png",
            data: base64FromDataUrl(attachment.dataUrl || ""),
          },
        })),
    );
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
  if (!multimodal) return text;
  const imageParts = attachments
    .filter(
      (attachment) =>
        attachment.kind === ATTACHMENT_KIND.image &&
        attachment.dataUrl &&
        isVisionImageMimeType(attachment.type),
    )
    .map((attachment) => ({
      type: "image_url",
      image_url: { url: attachment.dataUrl },
    }));
  return imageParts.length ? [{ type: "text", text }, ...imageParts] : text;
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

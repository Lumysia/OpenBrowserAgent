import {
  ATTACHMENT_KIND,
  ATTACHMENT_OUTPUT_NOTE,
  ATTACHMENT_TOOL_ERROR,
} from "../shared/attachments";
import type { ChatMessage, UploadedAttachment } from "../shared/types";
import {
  getUploadedAttachments,
  renderAttachmentContext,
  renderUserMessageWithContext,
} from "./message-helpers";

export function createGeminiContents(
  messages: ChatMessage[],
  multimodal: boolean,
  requestAttachments: UploadedAttachment[] = [],
) {
  return messages.map((message, index) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: createGeminiParts(
      message,
      index === messages.length - 1,
      multimodal,
      index === messages.length - 1 ? requestAttachments : [],
    ),
  }));
}

export function createOpenAIRequestMessages(
  system: string,
  messages: ChatMessage[],
  multimodal: boolean,
  requestAttachments: UploadedAttachment[] = [],
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
      ),
    })),
  ];
}

export function hasImageAttachments(attachments: UploadedAttachment[]) {
  return attachments.some(
    (attachment) => attachment.kind === ATTACHMENT_KIND.image,
  );
}

export function readUploadedAttachment(
  attachments: UploadedAttachment[],
  input: Record<string, unknown>,
) {
  const attachmentId = String(input.attachmentId || input.id || "");
  const attachment = attachments.find((item) => item.id === attachmentId);
  if (!attachment)
    return { error: ATTACHMENT_TOOL_ERROR.notFound, attachmentId };
  if (attachment.kind === ATTACHMENT_KIND.text)
    return {
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      kind: attachment.kind,
      text: attachment.text || "",
    };
  if (attachment.kind === ATTACHMENT_KIND.image)
    return {
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      kind: attachment.kind,
      dataUrl: attachment.dataUrl || "",
    };
  if (
    attachment.kind === ATTACHMENT_KIND.audio ||
    attachment.kind === ATTACHMENT_KIND.video
  )
    return {
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      kind: attachment.kind,
      note: ATTACHMENT_OUTPUT_NOTE.media,
    };
  if (attachment.kind === ATTACHMENT_KIND.document)
    return {
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      kind: attachment.kind,
      note: ATTACHMENT_OUTPUT_NOTE.document,
    };
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    kind: attachment.kind,
    note: ATTACHMENT_OUTPUT_NOTE.binary,
  };
}

function createGeminiParts(
  message: ChatMessage,
  isLatest: boolean,
  multimodal: boolean,
  requestAttachments: UploadedAttachment[],
) {
  const attachments = requestAttachments.length
    ? requestAttachments
    : getUploadedAttachments(message);
  const parts: Array<Record<string, unknown>> = [
    { text: renderMessageText(message, isLatest, requestAttachments) },
  ];
  if (!multimodal) return parts;
  for (const attachment of attachments) {
    if (attachment.kind !== ATTACHMENT_KIND.image || !attachment.dataUrl)
      continue;
    const [mimeHeader, data] = attachment.dataUrl.split(",", 2);
    const mimeType = mimeHeader.match(/^data:([^;]+)/)?.[1] || attachment.type;
    if (data) parts.push({ inlineData: { mimeType, data } });
  }
  return parts;
}

function createOpenAIMessageContent(
  message: ChatMessage,
  isLatest: boolean,
  multimodal: boolean,
  requestAttachments: UploadedAttachment[],
) {
  const text = renderMessageText(message, isLatest, requestAttachments);
  const attachments = requestAttachments.length
    ? requestAttachments
    : getUploadedAttachments(message);
  if (
    !multimodal ||
    !attachments.some((item) => item.kind === ATTACHMENT_KIND.image)
  )
    return text;
  return [
    { type: "text", text },
    ...attachments
      .filter(
        (attachment) =>
          attachment.kind === ATTACHMENT_KIND.image && !!attachment.dataUrl,
      )
      .map((attachment) => ({
        type: "image_url",
        image_url: { url: attachment.dataUrl || "" },
      })),
  ];
}

function renderMessageText(
  message: ChatMessage,
  isLatest: boolean,
  requestAttachments: UploadedAttachment[],
) {
  if (isLatest && message.role === "user")
    return renderUserMessageWithContext(message, requestAttachments);
  const attachmentContext = renderAttachmentContext(
    getUploadedAttachments(message),
  );
  return attachmentContext
    ? `${message.content}\n\n${attachmentContext}`
    : message.content;
}

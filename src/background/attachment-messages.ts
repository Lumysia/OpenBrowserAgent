import type { ChatMessage } from "../shared/types";
import {
  getUploadedAttachments,
  renderAttachmentContext,
  renderUserMessageWithContext,
} from "./message-helpers";

export function createGeminiContents(
  messages: ChatMessage[],
  multimodal: boolean,
) {
  return messages.map((message, index) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: createGeminiParts(
      message,
      index === messages.length - 1,
      multimodal,
    ),
  }));
}

export function createOpenAIRequestMessages(
  system: string,
  messages: ChatMessage[],
  multimodal: boolean,
) {
  return [
    { role: "system", content: system },
    ...messages.map((message, index) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: createOpenAIMessageContent(
        message,
        index === messages.length - 1,
        multimodal,
      ),
    })),
  ];
}

export function hasImageAttachments(messages: ChatMessage[]) {
  return messages.some((message) =>
    getUploadedAttachments(message).some(
      (attachment) => attachment.kind === "image",
    ),
  );
}

function createGeminiParts(
  message: ChatMessage,
  isLatest: boolean,
  multimodal: boolean,
) {
  const attachments = getUploadedAttachments(message);
  const parts: Array<Record<string, unknown>> = [
    { text: renderMessageText(message, isLatest) },
  ];
  if (!multimodal) return parts;
  for (const attachment of attachments) {
    if (attachment.kind !== "image" || !attachment.dataUrl) continue;
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
) {
  const text = renderMessageText(message, isLatest);
  const attachments = getUploadedAttachments(message);
  if (!multimodal || !attachments.some((item) => item.kind === "image"))
    return text;
  return [
    { type: "text", text },
    ...attachments
      .filter(
        (attachment) => attachment.kind === "image" && !!attachment.dataUrl,
      )
      .map((attachment) => ({
        type: "image_url",
        image_url: { url: attachment.dataUrl || "" },
      })),
  ];
}

function renderMessageText(message: ChatMessage, isLatest: boolean) {
  if (isLatest && message.role === "user")
    return renderUserMessageWithContext(message);
  const attachmentContext = renderAttachmentContext(
    getUploadedAttachments(message),
  );
  return attachmentContext
    ? `${message.content}\n\n${attachmentContext}`
    : message.content;
}

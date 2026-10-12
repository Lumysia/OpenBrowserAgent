import {
  ATTACHMENT_CONTEXT_TAG,
  isMetadataOnlyAttachment,
} from "../shared/attachments";
import { renderSourcesForPrompt } from "../shared/chat-sources";
import { getSkillInstruction } from "../shared/skills";
import type {
  ChatMessage,
  ChatSource,
  Skill,
  UploadedAttachment,
} from "../shared/types";

// Earlier turns are replayed as plain text; the latest user message also
// carries its context: skills the user picked, selected tabs and elements,
// attachments, and sources that can be cited again.
export function renderMessageText(
  message: ChatMessage,
  isLatest: boolean,
  requestAttachments: UploadedAttachment[],
) {
  if (isLatest && message.role === "user")
    return renderLatestUserMessage(message, requestAttachments);
  const attachments = renderAttachmentContext(getUploadedAttachments(message));
  return attachments ? `${message.content}\n\n${attachments}` : message.content;
}

function renderLatestUserMessage(
  message: ChatMessage,
  requestAttachments: UploadedAttachment[],
) {
  if (message.metadata?.internalRetry)
    return `<internal_instruction>\n${message.content}\n</internal_instruction>`;
  const skills = Array.isArray(message.metadata?.skills)
    ? (message.metadata.skills as Skill[])
    : [];
  const sources = Array.isArray(message.metadata?.sources)
    ? (message.metadata.sources as ChatSource[])
    : [];
  const context = [
    typeof message.metadata?.context === "string"
      ? message.metadata.context
      : "",
    renderAttachmentContext(
      requestAttachments.length
        ? requestAttachments
        : getUploadedAttachments(message),
    ),
    renderSourcesForPrompt(sources),
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    skills.length
      ? `<instruction>\n${skills.map(getSkillInstruction).join("\n\n")}\n</instruction>`
      : "",
    context ? `<message_context>\n${context}\n</message_context>` : "",
    `<message>\n${message.content}\n</message>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function getUploadedAttachments(message: ChatMessage) {
  return Array.isArray(message.metadata?.uploadedAttachments)
    ? (message.metadata.uploadedAttachments as UploadedAttachment[])
    : [];
}

function renderAttachmentContext(attachments: UploadedAttachment[]) {
  if (!attachments.length) return "";
  return `<${ATTACHMENT_CONTEXT_TAG}>\n${attachments
    .map(
      (attachment) =>
        `- attachment:${attachment.id} ${attachment.name} (${attachment.type || "unknown"}, ${attachment.size} bytes)${isMetadataOnlyAttachment(attachment.kind) ? " — binary; read with encoding base64 for its bytes" : ""}`,
    )
    .join("\n")}\n</${ATTACHMENT_CONTEXT_TAG}>`;
}

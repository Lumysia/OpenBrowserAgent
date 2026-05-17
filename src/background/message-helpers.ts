import { POST_TEXT_CHUNK_SIZE } from "../shared/config";
import {
  AI_TEXT_CHUNK_TYPE,
  type AiStreamResponse,
  type ChatMessage,
  type UploadedAttachment,
} from "../shared/types";

export function postText(
  port: chrome.runtime.Port,
  text: string,
  id: string,
  signal: AbortSignal,
  appendToMessageContent = true,
) {
  const chunkType = appendToMessageContent
    ? {
        start: AI_TEXT_CHUNK_TYPE.textStart,
        delta: AI_TEXT_CHUNK_TYPE.textDelta,
        end: AI_TEXT_CHUNK_TYPE.textEnd,
      }
    : {
        start: AI_TEXT_CHUNK_TYPE.textNoteStart,
        delta: AI_TEXT_CHUNK_TYPE.textNoteDelta,
        end: AI_TEXT_CHUNK_TYPE.textNoteEnd,
      };
  post(port, { type: "chunk", chunk: { type: chunkType.start, id } });
  for (const delta of chunkText(text)) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    post(port, {
      type: "chunk",
      chunk: { type: chunkType.delta, id, delta },
    });
  }
  post(port, { type: "chunk", chunk: { type: chunkType.end, id } });
}

function post(port: chrome.runtime.Port, message: AiStreamResponse) {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post ai-stream message", error);
  }
}

export function chunkText(text: string) {
  const chunks: string[] = [];
  const codePoints = Array.from(text);
  for (let index = 0; index < codePoints.length; index += POST_TEXT_CHUNK_SIZE)
    chunks.push(codePoints.slice(index, index + POST_TEXT_CHUNK_SIZE).join(""));
  return chunks;
}

export function parseToolArgs(value: string | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function renderUserMessageWithContext(
  message: ChatMessage,
  requestAttachments: UploadedAttachment[] = [],
) {
  if (message.metadata?.internalRetry) {
    return `<internal_instruction>
${message.content}
</internal_instruction>`;
  }

  const context =
    typeof message.metadata?.context === "string"
      ? message.metadata.context
      : "";
  const quickAction = message.metadata?.quickAction as
    | { instruction?: string }
    | undefined;
  const attachments = requestAttachments.length
    ? requestAttachments
    : getUploadedAttachments(message);
  return `${
    quickAction?.instruction
      ? `<instruction>
${quickAction.instruction}
</instruction>

`
      : ""
  }<message_context>

${context}

${renderAttachmentContext(attachments)}

</message_context>${
    quickAction?.instruction
      ? ""
      : `

<message>
${message.content}
</message>`
  }`;
}

export function getUploadedAttachments(message: ChatMessage) {
  return Array.isArray(message.metadata?.uploadedAttachments)
    ? (message.metadata.uploadedAttachments as UploadedAttachment[])
    : [];
}

export function renderAttachmentContext(attachments: UploadedAttachment[]) {
  if (!attachments.length) return "";
  return `<available_attachments>
${attachments
  .map((attachment) => {
    const header = `- id: ${attachment.id}\n  name: ${attachment.name}\n  type: ${attachment.type || "unknown"}\n  size: ${attachment.size} bytes\n  kind: ${attachment.kind}`;
    if (attachment.kind === "text" && attachment.text)
      return `${header}\n  note: Use readUploadedAttachment with this id to read the file text.`;
    if (attachment.kind === "image")
      return `${header}\n  note: Use readUploadedAttachment with this id to inspect the image data if needed.`;
    if (attachment.kind === "audio" || attachment.kind === "video")
      return `${header}\n  note: Audio and video content is metadata-only here; ask for a transcript or text export if needed.`;
    if (attachment.kind === "document")
      return `${header}\n  note: Document binary content is metadata-only here unless the file was uploaded as plain text.`;
    return `${header}\n  note: Binary content is not readable as text; use readUploadedAttachment for file metadata.`;
  })
  .join("\n\n")}
</available_attachments>`;
}

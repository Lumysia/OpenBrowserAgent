export const ATTACHMENT_KIND = {
  audio: "audio",
  document: "document",
  file: "file",
  image: "image",
  text: "text",
  video: "video",
} as const;

export type UploadedAttachmentKind =
  (typeof ATTACHMENT_KIND)[keyof typeof ATTACHMENT_KIND];

export const ATTACHMENT_CONTEXT_TAG = "available_attachments";

export const ATTACHMENT_TOOL_ERROR = {
  notFound: "Uploaded attachment not found",
} as const;

export const ATTACHMENT_READ_NOTE = {
  text: "Use readUploadedAttachment with this id to read the file text.",
  image:
    "Use readUploadedAttachment with this id to inspect the image data if needed.",
  media:
    "Audio and video can be read as base64 or hex slices only; ask for a transcript if semantic analysis is needed.",
  document:
    "Document binaries can be read as base64 or hex slices only unless the file was uploaded as plain text.",
  binary: "Binary content can be read as base64 or hex slices, not plain text.",
} as const;

export const ATTACHMENT_OUTPUT_NOTE = {
  media:
    "Audio and video files are available as base64 or hex slices only; ask the user for a transcript or text export if content analysis is needed.",
  document:
    "Document binaries such as PDF, Word, Excel, and PowerPoint are available as base64 or hex slices only unless pasted/exported as text.",
  binary: "Binary file content is available as base64 or hex slices only.",
} as const;

export const ATTACHMENT_TOOL_DESCRIPTION = {
  readUploadedAttachment:
    "Read a chat attachment by ID, including user-uploaded files and generated image/tool attachments. Use offset and limit to read only the needed slice and avoid oversized outputs.",
  attachmentId:
    "The attachment ID from available_attachments or a tool output such as imageAttachmentId",
  offset: "Zero-based character offset for text, base64, or hex output",
  limit: "Maximum characters to return for this read",
  format:
    "Read format. Use text for text files, base64 for binary data, or hex for binary data previews.",
} as const;

export const ATTACHMENT_MIME_PREFIX = {
  audio: "audio/",
  image: "image/",
  video: "video/",
} as const;

export const TEXT_ATTACHMENT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/yaml",
  "image/svg+xml",
  "text/css",
  "text/csv",
  "text/html",
  "text/javascript",
  "text/markdown",
  "text/plain",
  "text/xml",
]);

export const TEXT_ATTACHMENT_EXTENSION_PATTERN =
  /\.(csv|css|html?|json|jsonl|log|md|markdown|svg|tsv|txt|xml|ya?ml)$/i;

export const DOCUMENT_ATTACHMENT_EXTENSION_PATTERN =
  /\.(docx?|pdf|pptx?|rtf|xlsx?)$/i;

export const DOCUMENT_ATTACHMENT_MIME_HINTS = [
  "pdf",
  "officedocument",
  "msword",
  "ms-excel",
  "ms-powerpoint",
] as const;

export function classifyAttachment(name: string, type: string) {
  if (
    TEXT_ATTACHMENT_MIME_TYPES.has(type) ||
    TEXT_ATTACHMENT_EXTENSION_PATTERN.test(name)
  )
    return ATTACHMENT_KIND.text;
  if (type.startsWith(ATTACHMENT_MIME_PREFIX.image))
    return ATTACHMENT_KIND.image;
  if (type.startsWith(ATTACHMENT_MIME_PREFIX.audio))
    return ATTACHMENT_KIND.audio;
  if (type.startsWith(ATTACHMENT_MIME_PREFIX.video))
    return ATTACHMENT_KIND.video;
  if (
    DOCUMENT_ATTACHMENT_EXTENSION_PATTERN.test(name) ||
    DOCUMENT_ATTACHMENT_MIME_HINTS.some((hint) => type.includes(hint))
  )
    return ATTACHMENT_KIND.document;
  return ATTACHMENT_KIND.file;
}

export function isVisionImageMimeType(type?: string) {
  return !!type && type.startsWith("image/") && type !== "image/svg+xml";
}

export function base64FromDataUrl(dataUrl: string) {
  return dataUrl.includes(",") ? dataUrl.split(",", 2)[1] || "" : dataUrl;
}

export function isMetadataOnlyAttachment(kind: UploadedAttachmentKind) {
  return (
    kind === ATTACHMENT_KIND.audio ||
    kind === ATTACHMENT_KIND.document ||
    kind === ATTACHMENT_KIND.file ||
    kind === ATTACHMENT_KIND.video
  );
}

export function toAttachmentMetadata<
  T extends { dataUrl?: string; text?: string },
>(attachment: T) {
  const { dataUrl, text, ...metadata } = attachment;
  return metadata;
}

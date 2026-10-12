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

// Attachments the model cannot read as text or see as an image (documents
// are read as their text).
export function isMetadataOnlyAttachment(kind: UploadedAttachmentKind) {
  return (
    kind === ATTACHMENT_KIND.audio ||
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

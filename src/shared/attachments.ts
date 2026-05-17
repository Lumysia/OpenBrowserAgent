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
    "Audio and video content is metadata-only here; ask for a transcript or text export if needed.",
  document:
    "Document binary content is metadata-only here unless the file was uploaded as plain text.",
  binary:
    "Binary content is not readable as text; use readUploadedAttachment for file metadata.",
} as const;

export const ATTACHMENT_OUTPUT_NOTE = {
  media:
    "Audio and video files are available as metadata only in this browser extension path; ask the user for a transcript or a smaller text export if content analysis is needed.",
  document:
    "Document binaries such as PDF, Word, Excel, and PowerPoint are available as metadata only here unless pasted/exported as text.",
  binary: "Binary file content is not available as text.",
} as const;

export const ATTACHMENT_TOOL_DESCRIPTION = {
  readUploadedAttachment:
    "Read a user-uploaded attachment that is available in the current active chat memory. Use this when the USER asks about an uploaded local file or image.",
  attachmentId:
    "The attachment ID from the available_attachments list in the user context",
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
  "text/css",
  "text/csv",
  "text/html",
  "text/javascript",
  "text/markdown",
  "text/plain",
  "text/xml",
]);

export const TEXT_ATTACHMENT_EXTENSION_PATTERN =
  /\.(csv|css|html?|json|jsonl|log|md|markdown|tsv|txt|xml|ya?ml)$/i;

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
  if (type.startsWith(ATTACHMENT_MIME_PREFIX.image))
    return ATTACHMENT_KIND.image;
  if (
    TEXT_ATTACHMENT_MIME_TYPES.has(type) ||
    TEXT_ATTACHMENT_EXTENSION_PATTERN.test(name)
  )
    return ATTACHMENT_KIND.text;
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

export function isMetadataOnlyAttachment(kind: UploadedAttachmentKind) {
  return (
    kind === ATTACHMENT_KIND.audio ||
    kind === ATTACHMENT_KIND.document ||
    kind === ATTACHMENT_KIND.file ||
    kind === ATTACHMENT_KIND.video
  );
}

import {
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_TOTAL_BYTES,
} from "../../src/shared/config";
import type { UploadedAttachment } from "../../src/shared/types";

const TEXT_FILE_TYPES = new Set([
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

const TEXT_FILE_EXTENSIONS =
  /\.(csv|css|html?|json|jsonl|log|md|markdown|tsv|txt|xml|ya?ml)$/i;

export type AttachmentReadResult = {
  attachments: UploadedAttachment[];
  rejectedNames: string[];
};

export async function readUploadAttachments(
  files: Iterable<File>,
  existingBytes = 0,
): Promise<AttachmentReadResult> {
  const attachments: UploadedAttachment[] = [];
  const rejectedNames: string[] = [];
  let totalBytes = existingBytes;

  for (const file of files) {
    if (
      file.size > MAX_UPLOAD_FILE_BYTES ||
      totalBytes + file.size > MAX_UPLOAD_TOTAL_BYTES
    ) {
      rejectedNames.push(file.name);
      continue;
    }

    totalBytes += file.size;
    attachments.push(await readUploadAttachment(file));
  }

  return { attachments, rejectedNames };
}

export function attachmentBytes(attachments: UploadedAttachment[]) {
  return attachments.reduce((total, attachment) => total + attachment.size, 0);
}

export function formatAttachmentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readUploadAttachment(file: File): Promise<UploadedAttachment> {
  if (file.type.startsWith("image/")) {
    return readAsDataUrl(file).then((dataUrl) => ({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      size: file.size,
      kind: "image",
      dataUrl,
    }));
  }

  if (isTextFile(file)) {
    return readAsText(file).then((text) => ({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type || "text/plain",
      size: file.size,
      kind: "text",
      text,
    }));
  }

  return Promise.resolve({
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    kind: "file",
  });
}

function isTextFile(file: File) {
  return TEXT_FILE_TYPES.has(file.type) || TEXT_FILE_EXTENSIONS.test(file.name);
}

function readAsDataUrl(file: File) {
  return readFile(file, "readAsDataURL") as Promise<string>;
}

function readAsText(file: File) {
  return readFile(file, "readAsText") as Promise<string>;
}

function readFile(file: File, method: "readAsDataURL" | "readAsText") {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader[method](file);
  });
}

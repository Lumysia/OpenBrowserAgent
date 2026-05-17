import {
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_TOTAL_BYTES,
} from "../../src/shared/config";
import {
  ATTACHMENT_KIND,
  classifyAttachment,
} from "../../src/shared/attachments";
import type { UploadedAttachment } from "../../src/shared/types";

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
  const kind = classifyAttachment(file.name, file.type);

  if (kind === ATTACHMENT_KIND.text) {
    return readAsText(file).then((text) => ({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type || "text/plain",
      size: file.size,
      kind,
      text,
    }));
  }

  return readAsDataUrl(file).then((dataUrl) => ({
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    kind,
    dataUrl,
  }));
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

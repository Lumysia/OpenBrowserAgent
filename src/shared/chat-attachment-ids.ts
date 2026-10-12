import type { ChatContent, UploadedAttachment } from "./types";

// Attachment ids a chat's content refers to.
export function chatAttachmentIds(content: ChatContent) {
  const ids = new Set<string>();
  collectAttachmentReferences(content, ids);
  return ids;
}

function collectAttachmentReferences(
  value: unknown,
  ids: Set<string>,
  seen = new WeakSet<object>(),
) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (isAttachmentMetadata(value)) ids.add(value.id);

  if (Array.isArray(value)) {
    value.forEach((item) => collectAttachmentReferences(item, ids, seen));
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && isAttachmentIdKey(key)) {
      ids.add(item);
      continue;
    }
    if (Array.isArray(item) && isAttachmentIdsKey(key)) {
      item.forEach((id) => {
        if (typeof id === "string") ids.add(id);
      });
    }
    collectAttachmentReferences(item, ids, seen);
  }
}

function isAttachmentIdKey(key: string) {
  return key === "attachmentId" || key.endsWith("AttachmentId");
}

function isAttachmentIdsKey(key: string) {
  return key === "attachmentIds" || key.endsWith("AttachmentIds");
}

function isAttachmentMetadata(value: object): value is UploadedAttachment {
  const record = value as Partial<UploadedAttachment>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.type === "string" &&
    typeof record.size === "number" &&
    typeof record.kind === "string"
  );
}

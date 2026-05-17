import { useState } from "react";
import type { Messages } from "../../src/shared/i18n";
import type { UploadedAttachment } from "../../src/shared/types";
import { attachmentBytes, readUploadAttachments } from "./file-attachments";

export function useUploadedAttachments(t: Messages) {
  const [uploadedAttachments, setUploadedAttachments] = useState<
    UploadedAttachment[]
  >([]);
  const [pendingAttachmentIds, setPendingAttachmentIds] = useState<string[]>(
    [],
  );
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const pendingAttachments = uploadedAttachments.filter((attachment) =>
    pendingAttachmentIds.includes(attachment.id),
  );

  async function attachFiles(files: FileList | File[]) {
    const { attachments, rejectedNames } = await readUploadAttachments(
      files,
      attachmentBytes(uploadedAttachments),
    );
    if (attachments.length) {
      setUploadedAttachments((items) => [...items, ...attachments]);
      setPendingAttachmentIds((ids) => [
        ...ids,
        ...attachments.map((attachment) => attachment.id),
      ]);
    }
    setAttachmentNotice(
      rejectedNames.length
        ? t.sidepanel.attachmentTooLarge.replace(
            "{names}",
            rejectedNames.join(", "),
          )
        : "",
    );
  }

  function removeUploadedAttachment(id: string) {
    setUploadedAttachments((items) => items.filter((item) => item.id !== id));
    setPendingAttachmentIds((ids) => ids.filter((item) => item !== id));
    setAttachmentNotice("");
  }

  async function replaceUploadedAttachment(
    id: string,
    files: FileList | File[],
  ) {
    const [file] = Array.from(files);
    if (!file) return;
    const existingBytes = attachmentBytes(
      uploadedAttachments.filter((attachment) => attachment.id !== id),
    );
    const { attachments, rejectedNames } = await readUploadAttachments(
      [file],
      existingBytes,
    );
    const [replacement] = attachments;
    if (replacement)
      setUploadedAttachments((items) =>
        items.some((item) => item.id === id)
          ? items.map((item) =>
              item.id === id ? { ...replacement, id: item.id } : item,
            )
          : [...items, { ...replacement, id }],
      );
    setAttachmentNotice(
      rejectedNames.length
        ? t.sidepanel.attachmentTooLarge.replace(
            "{names}",
            rejectedNames.join(", "),
          )
        : "",
    );
  }

  function clearPendingAttachments() {
    setPendingAttachmentIds([]);
    setAttachmentNotice("");
  }

  function clearUploadedAttachments() {
    setUploadedAttachments([]);
    setPendingAttachmentIds([]);
    setAttachmentNotice("");
  }

  return {
    uploadedAttachments,
    pendingAttachments,
    attachmentNotice,
    attachFiles,
    removeUploadedAttachment,
    replaceUploadedAttachment,
    clearPendingAttachments,
    clearUploadedAttachments,
  };
}

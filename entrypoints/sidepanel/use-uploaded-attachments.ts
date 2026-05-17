import { useState } from "react";
import type { Messages } from "../../src/shared/i18n";
import type { UploadedAttachment } from "../../src/shared/types";
import { attachmentBytes, readUploadAttachments } from "./file-attachments";

export function useUploadedAttachments(t: Messages) {
  const [uploadedAttachments, setUploadedAttachments] = useState<
    UploadedAttachment[]
  >([]);
  const [attachmentNotice, setAttachmentNotice] = useState("");

  async function attachFiles(files: FileList | File[]) {
    const { attachments, rejectedNames } = await readUploadAttachments(
      files,
      attachmentBytes(uploadedAttachments),
    );
    if (attachments.length)
      setUploadedAttachments((items) => [...items, ...attachments]);
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
    setAttachmentNotice("");
  }

  function clearUploadedAttachments() {
    setUploadedAttachments([]);
    setAttachmentNotice("");
  }

  return {
    uploadedAttachments,
    attachmentNotice,
    attachFiles,
    removeUploadedAttachment,
    clearUploadedAttachments,
  };
}

import { File, FileText, Image, X } from "lucide-react";
import type { RefObject } from "react";
import type { Messages } from "../../src/shared/i18n";
import type { UploadedAttachment } from "../../src/shared/types";
import { formatAttachmentSize } from "./file-attachments";

export function UploadFileInput({
  inputRef,
  onAttachFiles,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onAttachFiles: (files: FileList | File[]) => Promise<void>;
}) {
  return (
    <input
      ref={inputRef}
      className="visually-hidden"
      type="file"
      multiple
      onChange={(event) => {
        if (event.target.files) void onAttachFiles(event.target.files);
        event.target.value = "";
      }}
    />
  );
}

export function UploadedAttachmentCard({
  attachment,
  t,
  onRemove,
}: {
  attachment: UploadedAttachment;
  t: Messages;
  onRemove: () => void;
}) {
  const status =
    attachment.kind === "file"
      ? t.sidepanel.fileMetadataOnly
      : t.sidepanel.willBeSentToAi;

  return (
    <div className="context-card attachment-card">
      <AttachmentPreview attachment={attachment} />
      <span>
        <strong>{attachment.name}</strong>
        <small>
          {status} · {formatAttachmentSize(attachment.size)}
        </small>
      </span>
      <button
        className="context-close"
        title={t.sidepanel.removeAttachment}
        onClick={onRemove}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function AttachmentPreview({ attachment }: { attachment: UploadedAttachment }) {
  if (attachment.kind === "image" && attachment.dataUrl)
    return <img src={attachment.dataUrl} alt="" />;
  if (attachment.kind === "text") return <FileText size={18} />;
  if (attachment.kind === "image") return <Image size={18} />;
  return <File size={18} />;
}

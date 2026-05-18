import { File, FileAudio, FileText, FileVideo, Image, X } from "lucide-react";
import type { RefObject } from "react";
import {
  ATTACHMENT_KIND,
  isMetadataOnlyAttachment,
} from "../../src/shared/attachments";
import type { Messages } from "../../src/shared/i18n";
import type { UploadedAttachment } from "../../src/shared/types";
import { Button } from "../../src/ui/components";
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
        if (event.target.files)
          void onAttachFiles(Array.from(event.target.files));
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
  const status = isMetadataOnlyAttachment(attachment.kind)
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
      <Button
        variant="ghost"
        size="icon"
        className="context-close"
        title={t.sidepanel.removeAttachment}
        onClick={onRemove}
      >
        <X size={14} />
      </Button>
    </div>
  );
}

function AttachmentPreview({ attachment }: { attachment: UploadedAttachment }) {
  if (attachment.kind === ATTACHMENT_KIND.image && attachment.dataUrl)
    return <img src={attachment.dataUrl} alt="" />;
  if (attachment.kind === ATTACHMENT_KIND.text) return <FileText size={18} />;
  if (attachment.kind === ATTACHMENT_KIND.audio) return <FileAudio size={18} />;
  if (attachment.kind === ATTACHMENT_KIND.video) return <FileVideo size={18} />;
  if (attachment.kind === ATTACHMENT_KIND.document)
    return <FileText size={18} />;
  if (attachment.kind === ATTACHMENT_KIND.image) return <Image size={18} />;
  return <File size={18} />;
}

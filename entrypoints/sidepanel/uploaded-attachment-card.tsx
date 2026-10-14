import { File, FileAudio, FileText, FileVideo, Image } from "lucide-react";
import type { RefObject } from "react";
import {
  ATTACHMENT_KIND,
  isMetadataOnlyAttachment,
} from "../../src/shared/attachments";
import type { Messages } from "../../src/shared/i18n";
import type { UploadedAttachment } from "../../src/shared/types";
import { formatBytes } from "../../src/shared/format";
import { ContextCard } from "./context-card";

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
    <ContextCard
      icon={<AttachmentPreview attachment={attachment} />}
      title={attachment.name}
      detail={`${status} · ${formatBytes(attachment.size)}`}
      removeLabel={t.sidepanel.removeAttachment}
      onRemove={onRemove}
    />
  );
}

function AttachmentPreview({ attachment }: { attachment: UploadedAttachment }) {
  if (attachment.kind === ATTACHMENT_KIND.image && attachment.dataUrl)
    return (
      <img src={attachment.dataUrl} alt="" loading="lazy" decoding="async" />
    );
  if (attachment.kind === ATTACHMENT_KIND.text) return <FileText size={18} />;
  if (attachment.kind === ATTACHMENT_KIND.audio) return <FileAudio size={18} />;
  if (attachment.kind === ATTACHMENT_KIND.video) return <FileVideo size={18} />;
  if (attachment.kind === ATTACHMENT_KIND.document)
    return <FileText size={18} />;
  if (attachment.kind === ATTACHMENT_KIND.image) return <Image size={18} />;
  return <File size={18} />;
}

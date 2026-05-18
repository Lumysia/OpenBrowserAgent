import { File, FileAudio, FileText, FileVideo, Image } from "lucide-react";
import { ATTACHMENT_KIND } from "../../src/shared/attachments";
import type { UploadedAttachment } from "../../src/shared/types";

export function FileIcon({
  attachment,
  size,
}: {
  attachment: UploadedAttachment;
  size: number;
}) {
  const icons: Partial<Record<UploadedAttachment["kind"], typeof File>> = {
    [ATTACHMENT_KIND.image]: Image,
    [ATTACHMENT_KIND.audio]: FileAudio,
    [ATTACHMENT_KIND.video]: FileVideo,
    [ATTACHMENT_KIND.text]: FileText,
    [ATTACHMENT_KIND.document]: FileText,
  };
  const Icon = icons[attachment.kind] || File;
  return <Icon size={size} />;
}

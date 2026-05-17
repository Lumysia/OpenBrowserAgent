import type { ChatMessage, UploadedAttachment } from "../../src/shared/types";

export type FileHandler = (files: FileList | File[]) => Promise<void>;
export type ReplaceAttachmentHandler = (
  id: string,
  files: FileList | File[],
) => Promise<void>;
export type MessageAttachmentHandler = (
  message: ChatMessage,
  attachments: UploadedAttachment[],
) => void;

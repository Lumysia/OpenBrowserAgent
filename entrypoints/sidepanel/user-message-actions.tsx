import { Check, Copy, Pencil, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { COPY_FEEDBACK_MS } from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import type { ChatMessage, UploadedAttachment } from "../../src/shared/types";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  buttonVariants,
} from "../../src/ui/components";
import { FileIcon } from "./attachment-file-icon";
import { formatAttachmentSize } from "./file-attachments";
import { formatMessageTime } from "./format";
import { IconTooltip } from "./icon-tooltip";

export function UserMessageActions({
  t,
  message,
  availableAttachments,
  missingAttachments,
  onReplaceAttachment,
  onEdit,
  onResend,
  resendDisabled = false,
}: {
  t: Messages;
  message: ChatMessage;
  availableAttachments: UploadedAttachment[];
  missingAttachments: UploadedAttachment[];
  onReplaceAttachment?: (id: string, files: FileList | File[]) => Promise<void>;
  onEdit?: (message: ChatMessage, attachments: UploadedAttachment[]) => void;
  onResend?: (message: ChatMessage, attachments: UploadedAttachment[]) => void;
  resendDisabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const hasMissingAttachments = missingAttachments.length > 0;

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  function copyText() {
    navigator.clipboard
      .writeText(message.content)
      .then(() => setCopied(true))
      .catch(() => undefined);
  }

  function resend() {
    if (resendDisabled) return;
    if (missingAttachments.length) {
      setOpen(true);
      return;
    }
    onResend?.(message, availableAttachments);
  }

  return (
    <div className="message-actions user-message-actions">
      <span>{formatMessageTime(message.createdAt)}</span>
      <IconTooltip label={copied ? t.common.copied : t.common.copy}>
        <Button
          variant="ghost"
          size="icon"
          className="copy-message"
          onClick={copyText}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </IconTooltip>
      <IconTooltip label={t.common.edit}>
        <Button
          variant="ghost"
          size="icon"
          className="copy-message"
          onClick={() => onEdit?.(message, availableAttachments)}
        >
          <Pencil />
        </Button>
      </IconTooltip>
      <Popover
        open={open}
        onOpenChange={(nextOpen) =>
          setOpen(missingAttachments.length ? nextOpen : false)
        }
      >
        <PopoverTrigger asChild>
          <span>
            <IconTooltip label={t.sidepanel.resendMessage}>
              <Button
                variant="ghost"
                size="icon"
                className="copy-message"
                disabled={resendDisabled}
                onClick={resend}
              >
                <RotateCcw />
              </Button>
            </IconTooltip>
          </span>
        </PopoverTrigger>
        <PopoverContent align="end" className="attachment-replace-popover">
          <strong>
            {hasMissingAttachments
              ? t.sidepanel.replaceUnavailableAttachments
              : t.sidepanel.resendMessage}
          </strong>
          {hasMissingAttachments && (
            <small>
              {t.sidepanel.replaceUnavailableAttachmentsDescription}
            </small>
          )}
          {missingAttachments.map((attachment) => (
            <div key={attachment.id} className="attachment-replace-row">
              <FileIcon attachment={attachment} size={18} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <strong>{attachment.name}</strong>
                    <small>{formatAttachmentSize(attachment.size)}</small>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{attachment.name}</TooltipContent>
              </Tooltip>
              <label
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                {t.sidepanel.attachFiles}
                <input
                  type="file"
                  onChange={(event) => {
                    if (event.target.files)
                      void onReplaceAttachment?.(
                        attachment.id,
                        event.target.files,
                      );
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          ))}
          <Button
            size="sm"
            variant={hasMissingAttachments ? "secondary" : "default"}
            disabled={resendDisabled}
            onClick={() => {
              setOpen(false);
              onResend?.(message, availableAttachments);
            }}
          >
            {hasMissingAttachments
              ? t.sidepanel.resendWithoutMissingFiles
              : t.sidepanel.resendMessage}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

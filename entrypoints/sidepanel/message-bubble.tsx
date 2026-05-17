import {
  Check,
  Copy,
  ExternalLink,
  File,
  FileAudio,
  FileText,
  FileVideo,
  Image,
  Pencil,
  MousePointerClick,
  RotateCcw,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { ATTACHMENT_KIND } from "../../src/shared/attachments";
import {
  COPY_FEEDBACK_MS,
  SENT_ATTACHMENTS_PREVIEW_COUNT,
  SENT_TABS_PREVIEW_COUNT,
  STREAM_RENDER_THROTTLE_MS,
} from "../../src/shared/config";
import { getMessages, type Messages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import type {
  AttachmentTab,
  ChatMessage,
  ChatPart,
  QuickAction,
  SelectedElement,
  UploadedAttachment,
} from "../../src/shared/types";
import { isToolPartType } from "../../src/shared/types";
import { useStoredState } from "../../src/ui/useStoredState";
import { IconTooltip } from "./icon-tooltip";
import { formatAttachmentSize } from "./file-attachments";
import { renderMarkdown } from "./markdown";
import { ToolPart } from "./tool-part";
import { useThrottledText } from "./use-throttled-text";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  buttonVariants,
} from "../../src/ui/components";

export function MessageBubble({
  message,
  editing = false,
  sentAttachments = [],
  activeAttachments = [],
  onReplaceAttachment,
  onEdit,
  onResend,
}: {
  message: ChatMessage;
  editing?: boolean;
  sentAttachments?: UploadedAttachment[];
  activeAttachments?: UploadedAttachment[];
  onReplaceAttachment?: (id: string, files: FileList | File[]) => Promise<void>;
  onEdit?: (message: ChatMessage, attachments: UploadedAttachment[]) => void;
  onResend?: (message: ChatMessage, attachments: UploadedAttachment[]) => void;
}) {
  const [language] = useStoredState(storage.language);
  const t = getMessages(language);
  const quickAction = message.metadata?.quickAction as QuickAction | undefined;
  const sentTabs = Array.isArray(message.metadata?.attachedTabs)
    ? (message.metadata.attachedTabs as AttachmentTab[])
    : [];
  const sentElement = message.metadata?.selectedElement as
    | SelectedElement
    | undefined;
  const assistantModel = message.metadata?.assistantModel as
    | { provider?: string; name?: string }
    | undefined;
  const hasParts = !!message.parts?.length;
  const metadataAttachments = Array.isArray(
    message.metadata?.uploadedAttachments,
  )
    ? (message.metadata.uploadedAttachments as UploadedAttachment[])
    : [];
  const displayAttachments = sentAttachments.length
    ? sentAttachments
    : metadataAttachments;
  const availableAttachments = displayAttachments
    .map(
      (attachment) =>
        activeAttachments.find((item) => item.id === attachment.id) ||
        sentAttachments.find((item) => item.id === attachment.id),
    )
    .filter((attachment): attachment is UploadedAttachment => !!attachment);
  const missingAttachments = displayAttachments.filter(
    (attachment) =>
      !availableAttachments.some((item) => item.id === attachment.id),
  );
  const modelLabel = assistantModel
    ? [assistantModel.provider, assistantModel.name].filter(Boolean).join(" · ")
    : undefined;
  return (
    <div
      className={`message ${message.role === "user" ? "user" : ""} ${editing ? "editing" : ""}`}
    >
      {quickAction && <div className="message-label">{quickAction.title}</div>}
      {message.role === "user" ? (
        <div className="user-bubble">{message.content}</div>
      ) : hasParts ? (
        message.parts?.map((part) => (
          <AssistantPart key={part.id} t={t} part={part} />
        ))
      ) : !message.content ? (
        <span className="typing-dots" aria-label="Thinking">
          <span />
          <span />
          <span />
        </span>
      ) : (
        <AssistantText
          text={message.content}
          modelLabel={modelLabel}
          createdAt={message.createdAt}
        />
      )}
      {message.role === "assistant" && hasParts && (
        <div className="assistant-actions">
          <span className="assistant-model-meta">
            {[modelLabel, formatMessageTime(message.createdAt)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      )}
      {message.role === "user" && !!sentTabs.length && (
        <div className="sent-context-row">
          <SentTabsChip tabs={sentTabs} />
        </div>
      )}
      {message.role === "user" && !!displayAttachments.length && (
        <div className="sent-context-row">
          <SentAttachmentsChip
            attachments={displayAttachments}
            unavailableCount={missingAttachments.length}
            t={t}
          />
        </div>
      )}
      {message.role === "user" && sentElement && (
        <div className="sent-context-row">
          <div className="sent-tab-chip">
            <MousePointerClick size={22} />
            <span>
              <strong>
                {sentElement.tagName || t.sidepanel.elementSelected}
              </strong>
            </span>
          </div>
        </div>
      )}
      {message.role === "user" && (
        <UserMessageActions
          t={t}
          message={message}
          availableAttachments={availableAttachments}
          missingAttachments={missingAttachments}
          onReplaceAttachment={onReplaceAttachment}
          onEdit={onEdit}
          onResend={onResend}
        />
      )}
    </div>
  );
}

function AssistantPart({ t, part }: { t: Messages; part: ChatPart }) {
  if (isToolPartType(part.type)) return <ToolPart t={t} part={part} />;
  if (part.type === "text" && part.text?.trim())
    return <AssistantText text={part.text} />;
  return null;
}

function AssistantText({
  text,
  modelLabel,
  createdAt,
}: {
  text: string;
  modelLabel?: string;
  createdAt?: number;
}) {
  const [language] = useStoredState(storage.language);
  const [copied, setCopied] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const t = getMessages(language);
  const displayText = useThrottledText(text, STREAM_RENDER_THROTTLE_MS);
  const { html, codeBlocks } = renderMarkdown(displayText, t, copiedCodeId);
  const streaming = displayText.length < text.length;

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  useEffect(() => {
    if (!copiedCodeId) return undefined;
    const timeout = window.setTimeout(
      () => setCopiedCodeId(null),
      COPY_FEEDBACK_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [copiedCodeId]);

  async function copyCode(event: React.MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement | null)?.closest(
      "button[data-code-index]",
    ) as HTMLButtonElement | null;
    if (!button) return;
    const codeIndex = Number(button.dataset.codeIndex);
    const code = codeBlocks[codeIndex];
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopiedCodeId(button.dataset.codeId || null);
  }

  function copyText() {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch(() => undefined);
  }

  return (
    <div className={`assistant-text${streaming ? " streaming" : ""}`}>
      <div
        className="markdown"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={copyCode}
      />
      <div className="assistant-actions">
        <IconTooltip label={copied ? t.common.copied : t.common.copy}>
          <button
            className={`copy-message${copied ? " copied" : ""}`}
            onClick={copyText}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </IconTooltip>
        {(modelLabel || createdAt) && (
          <span className="assistant-model-meta">
            {[modelLabel, createdAt ? formatMessageTime(createdAt) : ""]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}

function SentTabsChip({ tabs }: { tabs: AttachmentTab[] }) {
  const visibleTabs = tabs.slice(0, SENT_TABS_PREVIEW_COUNT);
  const title = tabs
    .slice(0, SENT_TABS_PREVIEW_COUNT)
    .map((tab) => tab.title || "Current page")
    .join(", ");
  const urls = tabs
    .slice(0, SENT_TABS_PREVIEW_COUNT)
    .map((tab) => tab.url?.replace(/^https?:\/\//, "").replace(/^www\./, ""))
    .filter(Boolean)
    .join(", ");
  const extraCount = tabs.length - visibleTabs.length;
  return (
    <div className="sent-tabs-chip">
      <div className="sent-tabs-icons">
        {visibleTabs.map((tab) =>
          tab.favIconUrl ? (
            <img key={tab.id} src={tab.favIconUrl} alt="" />
          ) : (
            <ExternalLink key={tab.id} size={24} />
          ),
        )}
      </div>
      <span>
        <strong>
          {title}
          {extraCount > 0 ? <em>+ {extraCount}</em> : null}
        </strong>
        <small>{urls}</small>
      </span>
    </div>
  );
}

function SentAttachmentsChip({
  attachments,
  unavailableCount = 0,
  t,
}: {
  attachments: UploadedAttachment[];
  unavailableCount?: number;
  t: Messages;
}) {
  const visibleAttachments = attachments.slice(
    0,
    SENT_ATTACHMENTS_PREVIEW_COUNT,
  );
  const extraCount = attachments.length - visibleAttachments.length;
  const title = visibleAttachments.map((item) => item.name).join(", ");
  return (
    <div className="sent-tabs-chip">
      <div className="sent-tabs-icons">
        {visibleAttachments.map((attachment) =>
          attachment.kind === ATTACHMENT_KIND.image && attachment.dataUrl ? (
            <img key={attachment.id} src={attachment.dataUrl} alt="" />
          ) : attachment.kind === ATTACHMENT_KIND.text ? (
            <FileText key={attachment.id} size={24} />
          ) : attachment.kind === ATTACHMENT_KIND.audio ? (
            <FileAudio key={attachment.id} size={24} />
          ) : attachment.kind === ATTACHMENT_KIND.video ? (
            <FileVideo key={attachment.id} size={24} />
          ) : attachment.kind === ATTACHMENT_KIND.document ? (
            <FileText key={attachment.id} size={24} />
          ) : attachment.kind === ATTACHMENT_KIND.image ? (
            <Image key={attachment.id} size={24} />
          ) : (
            <File key={attachment.id} size={24} />
          ),
        )}
      </div>
      <span>
        <strong>
          {title}
          {extraCount > 0 ? <em>+ {extraCount}</em> : null}
        </strong>
        <small>
          {unavailableCount
            ? t.sidepanel.unavailableAttachments.replace(
                "{count}",
                String(unavailableCount),
              )
            : t.sidepanel.willBeSentToAi}
        </small>
      </span>
    </div>
  );
}

function UserMessageActions({
  t,
  message,
  availableAttachments,
  missingAttachments,
  onReplaceAttachment,
  onEdit,
  onResend,
}: {
  t: Messages;
  message: ChatMessage;
  availableAttachments: UploadedAttachment[];
  missingAttachments: UploadedAttachment[];
  onReplaceAttachment?: (id: string, files: FileList | File[]) => Promise<void>;
  onEdit?: (message: ChatMessage, attachments: UploadedAttachment[]) => void;
  onResend?: (message: ChatMessage, attachments: UploadedAttachment[]) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

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
    if (missingAttachments.length) {
      setOpen(true);
      return;
    }
    onResend?.(message, availableAttachments);
  }
  const hasMissingAttachments = missingAttachments.length > 0;

  return (
    <div className="user-message-actions">
      <span>{formatMessageTime(message.createdAt)}</span>
      <IconTooltip label={copied ? t.common.copied : t.common.copy}>
        <button onClick={copyText}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </IconTooltip>
      <IconTooltip label={t.common.edit}>
        <button onClick={() => onEdit?.(message, availableAttachments)}>
          <Pencil size={13} />
        </button>
      </IconTooltip>
      <Popover
        open={open}
        onOpenChange={(nextOpen) =>
          setOpen(missingAttachments.length ? nextOpen : false)
        }
      >
        <PopoverTrigger asChild>
          <button onClick={resend}>
            <RotateCcw size={13} />
          </button>
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
              <span title={attachment.name}>
                <strong>{attachment.name}</strong>
                <small>{formatAttachmentSize(attachment.size)}</small>
              </span>
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

function FileIcon({
  attachment,
  size,
}: {
  attachment: UploadedAttachment;
  size: number;
}) {
  if (attachment.kind === ATTACHMENT_KIND.image) return <Image size={size} />;
  if (attachment.kind === ATTACHMENT_KIND.audio)
    return <FileAudio size={size} />;
  if (attachment.kind === ATTACHMENT_KIND.video)
    return <FileVideo size={size} />;
  if (attachment.kind === ATTACHMENT_KIND.text) return <FileText size={size} />;
  if (attachment.kind === ATTACHMENT_KIND.document)
    return <FileText size={size} />;
  return <File size={size} />;
}

function formatMessageTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

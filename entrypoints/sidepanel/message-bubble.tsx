import {
  Check,
  Copy,
  ExternalLink,
  File,
  FileAudio,
  FileText,
  FileVideo,
  Image,
  MousePointerClick,
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
import { renderMarkdown } from "./markdown";
import { ToolPart } from "./tool-part";
import { useThrottledText } from "./use-throttled-text";

export function MessageBubble({
  message,
  sentAttachments = [],
}: {
  message: ChatMessage;
  sentAttachments?: UploadedAttachment[];
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
  const hasParts = !!message.parts?.length;
  return (
    <div className={`message ${message.role === "user" ? "user" : ""}`}>
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
        <AssistantText text={message.content} />
      )}
      {message.role === "user" && !!sentTabs.length && (
        <div className="sent-context-row">
          <SentTabsChip tabs={sentTabs} />
        </div>
      )}
      {message.role === "user" && !!sentAttachments.length && (
        <div className="sent-context-row">
          <SentAttachmentsChip attachments={sentAttachments} t={t} />
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
    </div>
  );
}

function AssistantPart({ t, part }: { t: Messages; part: ChatPart }) {
  if (isToolPartType(part.type)) return <ToolPart t={t} part={part} />;
  if (part.type === "text" && part.text?.trim())
    return <AssistantText text={part.text} />;
  return null;
}

function AssistantText({ text }: { text: string }) {
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
      <IconTooltip label={copied ? t.common.copied : t.common.copy}>
        <button
          className={`copy-message${copied ? " copied" : ""}`}
          onClick={copyText}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </IconTooltip>
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
  t,
}: {
  attachments: UploadedAttachment[];
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
        <small>{t.sidepanel.willBeSentToAi}</small>
      </span>
    </div>
  );
}

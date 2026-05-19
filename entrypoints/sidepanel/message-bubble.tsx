import {
  ExternalLink,
  File,
  FileAudio,
  FileText,
  FileVideo,
  Image,
  MousePointerClick,
} from "lucide-react";
import { ATTACHMENT_KIND } from "../../src/shared/attachments";
import {
  SENT_ATTACHMENTS_PREVIEW_COUNT,
  SENT_TABS_PREVIEW_COUNT,
} from "../../src/shared/config";
import { getMessages, type Messages } from "../../src/shared/i18n";
import { getSkillDisplayName } from "../../src/shared/skills";
import { storage } from "../../src/shared/storage";
import { focusTab, openOrFocusUrl } from "../../src/shared/tab-navigation";
import type {
  AttachmentTab,
  ChatMessage,
  ChatSource,
  SelectedElement,
  Skill,
  UploadedAttachment,
} from "../../src/shared/types";
import { CHAT_PART_STATE } from "../../src/shared/types";
import { useStoredState } from "../../src/ui/useStoredState";
import { formatAttachmentSize } from "./file-attachments";
import { AssistantPart, AssistantText } from "./assistant-message-part";
import { MessageRunInfo } from "./message-run-info";
import { TypingIndicator } from "./typing-indicator";
import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../src/ui/components";
import { UserMessageActions } from "./user-message-actions";

export function MessageBubble({
  message,
  editing = false,
  sentAttachments = [],
  activeAttachments = [],
  onReplaceAttachment,
  onEdit,
  onResend,
  onFork,
  sources = [],
  chatMessages,
}: {
  message: ChatMessage;
  sources?: ChatSource[];
  chatMessages: ChatMessage[];
  editing?: boolean;
  sentAttachments?: UploadedAttachment[];
  activeAttachments?: UploadedAttachment[];
  onReplaceAttachment?: (id: string, files: FileList | File[]) => Promise<void>;
  onEdit?: (message: ChatMessage, attachments: UploadedAttachment[]) => void;
  onResend?: (message: ChatMessage, attachments: UploadedAttachment[]) => void;
  onFork?: (message: ChatMessage, partId?: string) => void;
}) {
  const [language] = useStoredState(storage.language);
  const t = getMessages(language);
  const skill = message.metadata?.skill as Skill | undefined;
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
  const assistantText = assistantMessageText(message);
  const displaySources = sourcesForAssistantMessage(message, sources);
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
  const showRunInfo = message.role === "assistant" && messageRunEnded(message);
  return (
    <div
      className={`message ${message.role === "user" ? "user" : ""} ${editing ? "editing" : ""}`}
    >
      {skill && (
        <div className="message-label">{getSkillDisplayName(skill)}</div>
      )}
      {message.role === "user" ? (
        <div className="user-bubble">{message.content}</div>
      ) : hasParts ? (
        message.parts?.map((part) => (
          <AssistantPart
            key={part.id}
            t={t}
            part={part}
            sources={sources}
            onFork={() => onFork?.(message, part.id)}
            message={message}
            chatMessages={chatMessages}
          />
        ))
      ) : !message.content ? (
        <TypingIndicator t={t} />
      ) : (
        <AssistantText
          t={t}
          text={message.content}
          sources={sources}
          modelLabel={modelLabel}
          createdAt={message.createdAt}
          onFork={() => onFork?.(message)}
          message={message}
          chatMessages={chatMessages}
          showRunInfo={showRunInfo}
        />
      )}
      {message.role === "assistant" &&
        hasParts &&
        (showRunInfo || modelLabel || message.createdAt) && (
          <div className="assistant-actions">
            {showRunInfo && (
              <div className="message-actions assistant-action-buttons">
                <MessageRunInfo
                  t={t}
                  message={message}
                  chatMessages={chatMessages}
                />
              </div>
            )}
            <span className="assistant-model-meta">
              {[modelLabel, formatMessageTime(message.createdAt)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        )}
      {message.role === "assistant" &&
        !!assistantText &&
        !!displaySources.length && <SourceChips sources={displaySources} />}
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

function SourceChips({ sources }: { sources: ChatSource[] }) {
  return (
    <div className="source-chip-list">
      {sources.map((source) => (
        <Tooltip key={source.id}>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openSource(source)}
            >
              <Badge>{source.id.replace(/^source_/, "")}</Badge>
              <span>{source.title}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{source.title}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function assistantMessageText(message: ChatMessage) {
  if (message.role !== "assistant") return "";
  if (!message.parts?.length) return message.content.trim();
  return message.parts
    .filter((part) => part.type === "text" || part.type === "reasoning")
    .map((part) => part.text || "")
    .join("")
    .trim();
}

function sourcesForAssistantMessage(
  message: ChatMessage,
  sources: ChatSource[],
) {
  const text = assistantMessageText(message);
  if (!text || !sources.length) return [];
  const citedIds = Array.from(
    text.matchAll(/\[\[cite:([\w-]+)\]\]/g),
    (match) => match[1],
  );
  if (!citedIds.length)
    return message.parts?.length && !lastAssistantPartIsText(message)
      ? []
      : sources;
  const citedSet = new Set(citedIds);
  return sources.filter((source) => citedSet.has(source.id));
}

function lastAssistantPartIsText(message: ChatMessage) {
  const lastPart = message.parts
    ?.filter((part) => part.type === "text" || part.type.startsWith("tool-"))
    .at(-1);
  return lastPart?.type === "text" && !!lastPart.text?.trim();
}

function messageRunEnded(message: ChatMessage) {
  const metrics = message.metadata?.runMetrics as { endedAt?: unknown };
  return (
    !!metrics?.endedAt ||
    !!message.parts?.some((part) => part.state === CHAT_PART_STATE.outputError)
  );
}

function openSource(source: ChatSource) {
  if (source.url) {
    openOrFocusUrl(source.url).catch(console.warn);
    return;
  }
  if (source.tabId) focusTab(source.tabId).catch(console.warn);
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

function formatMessageTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

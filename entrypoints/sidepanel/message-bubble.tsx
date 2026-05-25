import {
  ExternalLink,
  File,
  FileAudio,
  FileText,
  FileVideo,
  Image,
  MousePointerClick,
} from "lucide-react";
import { Fragment, useState } from "react";
import { ATTACHMENT_KIND } from "../../src/shared/attachments";
import {
  SENT_ATTACHMENTS_PREVIEW_COUNT,
  SENT_TABS_PREVIEW_COUNT,
} from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import { getSkillDisplayName } from "../../src/shared/skills";
import { focusTab, openOrFocusUrl } from "../../src/shared/tab-navigation";
import type {
  AttachmentTab,
  Chat,
  ChatMessage,
  ChatSource,
  QuestionToolAnswer,
  SelectedElement,
  Skill,
  UploadedAttachment,
} from "../../src/shared/types";
import { CHAT_PART_STATE, isToolPartType } from "../../src/shared/types";
import { formatAttachmentSize } from "./file-attachments";
import { formatMessageTime } from "./format";
import {
  AssistantPart,
  AssistantSummaryCard,
  AssistantText,
} from "./assistant-message-part";
import { MessageRunInfo } from "./message-run-info";
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
  t,
  editing = false,
  sentAttachments = [],
  activeAttachments = [],
  onReplaceAttachment,
  onEdit,
  onResend,
  onFork,
  onSelectChat,
  onAnswerQuestion,
  chats,
  resendDisabled = false,
  sources = [],
  chatMessages,
  latestUserMessage = false,
  outputActive = false,
}: {
  message: ChatMessage;
  t: Messages;
  sources?: ChatSource[];
  chatMessages: ChatMessage[];
  editing?: boolean;
  sentAttachments?: UploadedAttachment[];
  activeAttachments?: UploadedAttachment[];
  onReplaceAttachment?: (id: string, files: FileList | File[]) => Promise<void>;
  onEdit?: (message: ChatMessage, attachments: UploadedAttachment[]) => void;
  onResend?: (message: ChatMessage, attachments: UploadedAttachment[]) => void;
  onFork?: (message: ChatMessage, partId?: string) => void;
  onSelectChat?: (chatId: string) => void;
  onAnswerQuestion?: (
    toolCallId: string,
    answers: QuestionToolAnswer[],
  ) => void;
  chats: Chat[];
  resendDisabled?: boolean;
  latestUserMessage?: boolean;
  outputActive?: boolean;
}) {
  const messageSkills = selectedMessageSkills(message.metadata);
  const sentTabs = Array.isArray(message.metadata?.attachedTabs)
    ? (message.metadata.attachedTabs as AttachmentTab[])
    : [];
  const sentElements = selectedElementsFromMetadata(message.metadata);
  const assistantModel = message.metadata?.assistantModel as
    | { provider?: string; name?: string }
    | undefined;
  const hasParts = !!message.parts?.length;
  const summaryAfterPartIndex = legacySummaryInsertionIndex(message);
  const assistantText = assistantMessageText(message);
  const assistantContentFallback = assistantMessageContentFallback(message);
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
  const assistantEnded =
    message.role === "assistant" && messageRunEnded(message) && !outputActive;
  const chatExists = (chatId: string) =>
    chats.some((chat) => chat.id === chatId);
  return (
    <div
      className={`message ${message.role === "user" ? "user" : ""} ${latestUserMessage ? "latest-user" : ""} ${editing ? "editing" : ""}`}
    >
      {!!messageSkills.length && (
        <div
          className="message-label"
          title={messageSkills
            .map((skill) => getSkillDisplayName(skill))
            .join(", ")}
        >
          <FileText size={13} />
          <span>
            {messageSkills
              .map((skill) => getSkillDisplayName(skill))
              .join(", ")}
          </span>
        </div>
      )}
      {message.role === "user" ? (
        <div className="user-bubble">{message.content}</div>
      ) : hasParts ? (
        <>
          {assistantContentFallback && (
            <AssistantText
              t={t}
              text={assistantContentFallback}
              sources={sources}
              onFork={() => onFork?.(message)}
              message={message}
              chatMessages={chatMessages}
              hideActions={!assistantEnded}
            />
          )}
          {message.parts?.map((part, index) => (
            <Fragment key={part.id}>
              <AssistantPart
                t={t}
                part={part}
                partIndex={index}
                sources={sources}
                onFork={() => onFork?.(message, part.id)}
                message={message}
                chatMessages={chatMessages}
                onSelectChat={onSelectChat}
                chatExists={chatExists}
                onAnswerQuestion={onAnswerQuestion}
              />
              {index === summaryAfterPartIndex && (
                <AssistantSummaryCard t={t} message={message} />
              )}
            </Fragment>
          ))}
        </>
      ) : !message.content ? null : (
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
          hideActions={!assistantEnded}
        />
      )}
      {message.role === "assistant" &&
        !outputActive &&
        !!assistantText &&
        !!displaySources.length && (
          <SourceChips t={t} sources={displaySources} />
        )}
      {message.role === "assistant" &&
        hasParts &&
        assistantEnded &&
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
      {message.role === "user" && !!sentElements.length && (
        <div className="sent-context-row">
          <div className="sent-tab-chip">
            <MousePointerClick size={22} />
            <span>
              <strong>
                {sentElements.length === 1
                  ? sentElements[0].tagName || t.sidepanel.elementSelected
                  : `${t.sidepanel.elementSelected} x${sentElements.length}`}
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
          resendDisabled={resendDisabled}
        />
      )}
    </div>
  );
}

function selectedElementsFromMetadata(
  metadata: Record<string, unknown> | undefined,
) {
  if (Array.isArray(metadata?.selectedElements))
    return metadata.selectedElements as SelectedElement[];
  return metadata?.selectedElement
    ? [metadata.selectedElement as SelectedElement]
    : [];
}

function legacySummaryInsertionIndex(message: ChatMessage) {
  const parts = message.parts || [];
  if (parts.some((part) => part.type === "summary")) return -1;
  if (!compactionSummary(message)) return -1;
  if (!parts.length) return -1;
  const lastToolPartIndex = parts.reduce(
    (lastIndex, part, index) => (isToolPartType(part.type) ? index : lastIndex),
    -1,
  );
  return lastToolPartIndex >= 0 ? lastToolPartIndex : parts.length - 1;
}

function compactionSummary(message: ChatMessage) {
  const metrics = message.metadata?.runMetrics as
    | { contextBudget?: { compactionSummary?: unknown } }
    | undefined;
  const summary = metrics?.contextBudget?.compactionSummary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : "";
}

function selectedMessageSkills(metadata: Record<string, unknown> | undefined) {
  const skills = Array.isArray(metadata?.skills)
    ? (metadata.skills as Skill[])
    : [];
  const skill = metadata?.skill as Skill | undefined;
  return skills.length ? skills : skill ? [skill] : [];
}

const SOURCE_CHIP_PREVIEW_COUNT = 5;

function SourceChips({ t, sources }: { t: Messages; sources: ChatSource[] }) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(0, sources.length - SOURCE_CHIP_PREVIEW_COUNT);
  const visibleSources = expanded
    ? sources
    : sources.slice(0, SOURCE_CHIP_PREVIEW_COUNT);
  return (
    <div className="source-chip-list">
      {visibleSources.map((source) => (
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
      {!!hiddenCount && (
        <Button
          variant="secondary"
          size="sm"
          className="source-chip-toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? t.sidepanel.showFewerSources
            : t.sidepanel.showMoreSources.replace(
                "{count}",
                String(hiddenCount),
              )}
        </Button>
      )}
    </div>
  );
}

function assistantMessageText(message: ChatMessage) {
  if (message.role !== "assistant") return "";
  const contentFallback = assistantMessageContentFallback(message);
  const partText = assistantPartText(message);
  return [contentFallback, partText].filter(Boolean).join("").trim();
}

function assistantMessageContentFallback(message: ChatMessage) {
  const content = message.content.trim();
  if (message.role !== "assistant" || !content || !message.parts?.length)
    return !message.parts?.length ? content : "";
  const partText = assistantPartText(message).trim();
  return partText.includes(content) ? "" : content;
}

function assistantPartText(message: ChatMessage) {
  return (message.parts || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("")
    .trim();
}

function sourcesForAssistantMessage(
  message: ChatMessage,
  sources: ChatSource[],
) {
  const text = assistantMessageText(message);
  if (!text || !sources.length || !messageRunEnded(message)) return [];
  const citedIds = Array.from(
    text.matchAll(/\[\[cite:([\w-]+)\]\]/g),
    (match) => match[1],
  );
  if (!citedIds.length) return sources;
  const citedSet = new Set(citedIds);
  return sources.filter((source) => citedSet.has(source.id));
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
            <img
              key={tab.id}
              src={tab.favIconUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
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
            <img
              key={attachment.id}
              src={attachment.dataUrl}
              alt=""
              loading="lazy"
              decoding="async"
            />
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

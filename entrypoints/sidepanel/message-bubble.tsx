import { FileText } from "lucide-react";
import {
  debugLog,
  isDebugLoggingEnabled,
} from "../../src/shared/debug-logging";
import type { Messages } from "../../src/shared/i18n";
import { pickedSkillsFromMetadata } from "../../src/shared/skills";
import type {
  AttachmentTab,
  ChatSummary,
  ChatMessage,
  ChatSource,
  QuestionToolAnswer,
  SelectedElement,
  UploadedAttachment,
} from "../../src/shared/types";
import { CHAT_PART_STATE, isToolPartType } from "../../src/shared/types";
import { UserText } from "../../src/ui/components";
import { providerNameDisplay } from "../../src/ui/provider-display";
import { skillDisplay } from "../../src/ui/skill-display";
import { messageRunEnded } from "./run-state";
import { formatMessageTime } from "./format";
import {
  AssistantPart,
  AssistantText,
  NO_SOURCES,
} from "./assistant-message-part";
import { MessageRunInfo } from "./message-run-info";
import { RunStopNotice } from "./run-stop-notice";
import { replyCutOff } from "../../src/shared/run-stop";
import { UserMessageActions } from "./user-message-actions";
import {
  SentAttachmentsChip,
  SentSelectedTextChip,
  SentElementsChip,
  SentTabsChip,
  SourceChips,
} from "./message-chips";
import { selectedTextsFromMetadata } from "../../src/shared/selected-text";

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
  sources = NO_SOURCES,
  chatMessages,
  latestUserMessage = false,
  outputActive = false,
  runStopped = false,
  onContinue,
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
  chats: ChatSummary[];
  resendDisabled?: boolean;
  latestUserMessage?: boolean;
  outputActive?: boolean;
  // The background has no run of this reply (see run-state).
  runStopped?: boolean;
  // Asks the model to go on after this reply, if it ended early.
  onContinue?: () => void;
}) {
  const skillNames = pickedSkillsFromMetadata(message.metadata)
    .map((skill) => skillDisplay(skill, t).name)
    .join(", ");
  const sentTabs = Array.isArray(message.metadata?.attachedTabs)
    ? (message.metadata.attachedTabs as AttachmentTab[])
    : [];
  const sentElements = selectedElementsFromMetadata(message.metadata);
  const sentTexts = selectedTextsFromMetadata(message.metadata);
  const assistantModel = message.metadata?.assistantModel as
    { provider?: string; name?: string } | undefined;
  const hasParts = !!message.parts?.length;
  const assistantText = assistantMessageText(message);
  const assistantContentFallback = assistantMessageContentFallback(message);
  const runEnded = messageRunEnded(message, runStopped);
  const displaySources = runEnded
    ? sourcesForAssistantMessage(message, sources)
    : [];
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
    ? [
        assistantModel.provider &&
          providerNameDisplay(assistantModel.provider, t),
        assistantModel.name,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;
  const showRunInfo = message.role === "assistant" && runEnded;
  const assistantEnded =
    message.role === "assistant" && runEnded && !outputActive;
  const cut = assistantEnded ? replyCutOff(message) : undefined;
  const chatExists = (chatId: string) =>
    chats.some((chat) => chat.id === chatId);
  const assistantPartEntries = chronologicalAssistantPartEntries(
    message.parts || [],
  );
  if (message.role === "assistant" && hasParts && isDebugLoggingEnabled())
    debugLog("[OBA assistant-order]", {
      messageId: message.id,
      contentLength: message.content.length,
      fallbackLength: assistantContentFallback.length,
      outputActive,
      assistantEnded,
      parts: message.parts?.map(debugAssistantPart),
      displayParts: assistantPartEntries.map(({ part }) =>
        debugAssistantPart(part),
      ),
    });
  return (
    <div
      className={`message ${message.role === "user" ? "user" : ""} ${latestUserMessage ? "latest-user" : ""} ${editing ? "editing" : ""}`}
    >
      {!!skillNames && (
        <div className="message-label" title={skillNames}>
          <FileText size={13} />
          <span>{skillNames}</span>
        </div>
      )}
      {message.role === "user" ? (
        <div className="user-bubble">
          <UserText text={message.content} />
        </div>
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
          {assistantPartEntries.map(({ part, index }) => (
            <AssistantPart
              key={part.id}
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
              runEnded={runEnded}
            />
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
      {cut && <RunStopNotice t={t} cut={cut} onContinue={onContinue} />}
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
          <SentTabsChip t={t} tabs={sentTabs} />
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
          <SentElementsChip t={t} elements={sentElements} />
        </div>
      )}
      {message.role === "user" &&
        sentTexts.map((selection, index) => (
          <div key={index} className="sent-context-row">
            <SentSelectedTextChip selection={selection} t={t} />
          </div>
        ))}
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
  return Array.isArray(metadata?.selectedElements)
    ? (metadata.selectedElements as SelectedElement[])
    : [];
}

function chronologicalAssistantPartEntries(
  parts: NonNullable<ChatMessage["parts"]>,
) {
  const entries: Array<{
    part: NonNullable<ChatMessage["parts"]>[number];
    index: number;
  }> = [];
  let reasoningGroup:
    { firstIndex: number; ids: string[]; texts: string[] } | undefined;

  parts.forEach((part, index) => {
    if (part.type === "reasoning") {
      const text = part.text?.trim();
      if (!text) return;
      if (!reasoningGroup)
        reasoningGroup = { firstIndex: index, ids: [], texts: [] };
      reasoningGroup.ids.push(part.id);
      reasoningGroup.texts.push(text);
      return;
    }
    flushReasoningGroup();
    entries.push({ part, index });
  });
  flushReasoningGroup();
  return entries;

  function flushReasoningGroup() {
    if (!reasoningGroup) return;
    entries.push({
      index: reasoningGroup.firstIndex,
      part: {
        id: `merged-reasoning-${reasoningGroup.ids.join("-")}`,
        type: "reasoning" as const,
        text: reasoningGroup.texts.join("\n\n"),
      },
    });
    reasoningGroup = undefined;
  }
}

function debugAssistantPart(part: NonNullable<ChatMessage["parts"]>[number]) {
  return {
    id: part.id,
    type: part.type,
    toolName: isToolPartType(part.type) ? part.toolName : undefined,
    state: part.state,
    textLength: part.text?.length || 0,
  };
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
  if (!text || !sources.length) return [];
  const citedIds = Array.from(
    text.matchAll(/\[\[cite:([\w-]+)\]\]/g),
    (match) => match[1],
  );
  if (!citedIds.length) return sources;
  const citedSet = new Set(citedIds);
  return sources.filter((source) => citedSet.has(source.id));
}

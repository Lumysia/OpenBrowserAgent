import { FileText } from "lucide-react";
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
import {
  assistantMessageContentFallback,
  assistantMessageText,
} from "./assistant-message-text";
import { replyCutOff } from "../../src/shared/run-stop";
import { UserMessageActions } from "./user-message-actions";
import { SourceChips } from "./message-chips";
import { SentContextPills } from "./sent-context-pills";
import { selectedTextsFromMetadata } from "../../src/shared/selected-text";
import { cn } from "../../src/ui/utils";
import { useLocale, useMessages } from "../../src/ui/messages";

export function MessageBubble({
  message,
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
  const t = useMessages();
  const locale = useLocale();
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
  // A sent file is shown from this page's copy, else from the message when
  // it holds the content; without either it is unavailable here.
  const loadedAttachment = (attachment: UploadedAttachment) =>
    activeAttachments.find((item) => item.id === attachment.id) ||
    sentAttachments.find((item) => item.id === attachment.id) ||
    (attachment.dataUrl || attachment.text !== undefined
      ? attachment
      : undefined);
  const displayAttachments = (
    metadataAttachments.length ? metadataAttachments : sentAttachments
  ).map((attachment) => loadedAttachment(attachment) || attachment);
  const availableAttachments = displayAttachments.filter(
    (attachment) => !!loadedAttachment(attachment),
  );
  const missingAttachments = displayAttachments.filter(
    (attachment) => !loadedAttachment(attachment),
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
  const assistantParts = chronologicalAssistantParts(message.parts || []);
  return (
    <div
      className={cn(
        "message",
        message.role === "user" && "user",
        latestUserMessage && "latest-user",
        editing && "editing",
      )}
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
              text={assistantContentFallback}
              sources={sources}
              onFork={() => onFork?.(message)}
              message={message}
              chatMessages={chatMessages}
              hideActions={!assistantEnded}
            />
          )}
          {assistantParts.map((part) => (
            <AssistantPart
              key={part.id}
              part={part}
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
        !!displaySources.length && <SourceChips sources={displaySources} />}
      {cut && <RunStopNotice cut={cut} onContinue={onContinue} />}
      {message.role === "assistant" &&
        hasParts &&
        assistantEnded &&
        (showRunInfo || modelLabel || message.createdAt) && (
          <div className="assistant-actions">
            {showRunInfo && (
              <div className="message-actions assistant-action-buttons">
                <MessageRunInfo message={message} chatMessages={chatMessages} />
              </div>
            )}
            <span className="assistant-model-meta">
              {[modelLabel, formatMessageTime(locale, message.createdAt)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        )}
      {message.role === "user" && (
        <SentContextPills
          tabs={sentTabs}
          attachments={displayAttachments}
          missingAttachmentIds={
            new Set(missingAttachments.map((attachment) => attachment.id))
          }
          elements={sentElements}
          texts={sentTexts}
        />
      )}
      {message.role === "user" && (
        <UserMessageActions
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

// Consecutive reasoning parts show as one.
function chronologicalAssistantParts(parts: NonNullable<ChatMessage["parts"]>) {
  const result: NonNullable<ChatMessage["parts"]> = [];
  let reasoningGroup: { ids: string[]; texts: string[] } | undefined;

  parts.forEach((part) => {
    if (part.type === "reasoning") {
      const text = part.text?.trim();
      if (!text) return;
      if (!reasoningGroup) reasoningGroup = { ids: [], texts: [] };
      reasoningGroup.ids.push(part.id);
      reasoningGroup.texts.push(text);
      return;
    }
    flushReasoningGroup();
    result.push(part);
  });
  flushReasoningGroup();
  return result;

  function flushReasoningGroup() {
    if (!reasoningGroup) return;
    result.push({
      id: `merged-reasoning-${reasoningGroup.ids.join("-")}`,
      type: "reasoning" as const,
      text: reasoningGroup.texts.join("\n\n"),
    });
    reasoningGroup = undefined;
  }
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

import { Plus } from "lucide-react";
import { useRef, type ClipboardEvent, type RefObject } from "react";
import { TOOLTIP_DELAY_MS } from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import type { SyncWriteStatus } from "../../src/shared/storage";
import type {
  AttachmentTab,
  Agent,
  Chat,
  ChatMessage,
  ChatSummary,
  ModelConfig,
  Preferences,
  QuestionToolAnswer,
  PickedSkill,
  SelectedElement,
  UploadedAttachment,
} from "../../src/shared/types";
import { Button, TooltipProvider } from "../../src/ui/components";
import { ComposerAttachments } from "./composer-attachments";
import { ComposerBox } from "./composer-box";
import { EditModeOverlay } from "./edit-mode-overlay";
import { HistoryPanel } from "./history-panel";
import { MessageJumpControls } from "./message-jump-controls";
import { MessageBubble } from "./message-bubble";
import { ProvidersEmptyState } from "./providers-empty-state";
import { QueuedMessages } from "./queued-messages";
import { SidepanelHeader } from "./sidepanel-header";
import { TypingIndicator } from "./typing-indicator";
import type { AddMenuView, ComposerMenu } from "./sidepanel-menu-state";
import { addSkill } from "./skill-context";
import type {
  FileHandler,
  MessageAttachmentHandler,
  ReplaceAttachmentHandler,
} from "./sidepanel-view-types";
import { UploadFileInput } from "./uploaded-attachment-card";
import type { QueuedMessage } from "./use-queued-messages";
import { useDeferredPresence } from "./use-deferred-remove";
import { ChatContentStatus } from "./chat-content-status";
import type { SummariesUpdater } from "./use-chats";
import type { CurrentChatStatus } from "./use-current-chat";

export function SidepanelView({
  t,
  providersReady,
  modelCount,
  activeChatId,
  currentChat,
  currentChatStatus,
  chats,
  preferences,
  configuredModels,
  input,
  activeAgent,
  syncWriteStatus,
  attachedTabs,
  pendingAttachments,
  selectedSkills,
  uploadedAttachments,
  queuedMessages,
  sentAttachmentPreviews,
  attachmentNotice,
  availableTabs,
  activeTabAttachable,
  selectedElements,
  streaming,
  activeAssistantMessageId,
  unreadCompletedChatIds,
  skills,
  agents,
  openMenu,
  addMenuView,
  showHistory,
  aiWorking,
  editingMessageId,
  sidepanelRef,
  messagesRef,
  composerRef,
  onSetInput,
  onSetOpenMenu,
  onSetAddMenuView,
  onSetShowHistory,
  onSetSelectedElements,
  onSetSelectedSkills,
  onSetChats,
  onLoadChat,
  onRetryChat,
  onSetPreferences,
  onCreateChat,
  onImportChat,
  onCloseChat,
  onSend,
  onStop,
  onDeleteQueuedMessage,
  onEditQueuedMessage,
  onAnswerQuestion,
  onToggleSkill,
  onCancelEditMessage,
  onShowAllTabsPicker,
  onToggleAttachedTab,
  onAttachActiveTab,
  onRemoveAttachedTab,
  onAttachFiles,
  onRemoveUploadedAttachment,
  onReplaceUploadedAttachment,
  onEditMessage,
  onResendMessage,
  onForkMessage,
  onSelectElement,
  onSelectChat,
}: {
  t: Messages;
  providersReady: boolean;
  modelCount: number;
  activeChatId?: string;
  currentChat?: Chat;
  currentChatStatus: CurrentChatStatus;
  chats: ChatSummary[];
  preferences?: Preferences;
  configuredModels: ModelConfig[];
  input: string;
  activeAgent: Agent;
  syncWriteStatus?: SyncWriteStatus;
  attachedTabs: AttachmentTab[];
  pendingAttachments: UploadedAttachment[];
  selectedSkills: PickedSkill[];
  uploadedAttachments: UploadedAttachment[];
  queuedMessages: QueuedMessage[];
  sentAttachmentPreviews: Record<string, UploadedAttachment[]>;
  attachmentNotice: string;
  availableTabs: AttachmentTab[];
  activeTabAttachable: boolean;
  selectedElements: SelectedElement[];
  streaming: boolean;
  activeAssistantMessageId?: string;
  unreadCompletedChatIds: Record<string, true>;
  skills: PickedSkill[];
  agents: Agent[];
  openMenu: ComposerMenu | null;
  addMenuView: AddMenuView;
  showHistory: boolean;
  aiWorking: boolean;
  editingMessageId?: string;
  sidepanelRef: RefObject<HTMLDivElement | null>;
  messagesRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onSetInput: (value: string) => void;
  onSetOpenMenu: (value: ComposerMenu | null) => void;
  onSetAddMenuView: (value: AddMenuView) => void;
  onSetShowHistory: (value: boolean) => void;
  onSetSelectedElements: (value: SelectedElement[]) => void;
  onSetSelectedSkills: (value: PickedSkill[]) => void;
  onSetChats: SummariesUpdater;
  onLoadChat: (chatId: string) => Promise<Chat | undefined>;
  onRetryChat: () => void;
  onSetPreferences: (
    value: Preferences | ((previous: Preferences) => Preferences),
  ) => void;
  onCreateChat: () => void;
  onImportChat: (chat: Chat) => void;
  onCloseChat: (chatId: string) => void;
  onSend: () => void;
  onStop: () => void;
  onDeleteQueuedMessage: (id: string) => void;
  onEditQueuedMessage: (message: QueuedMessage) => void;
  onAnswerQuestion: (toolCallId: string, answers: QuestionToolAnswer[]) => void;
  onToggleSkill: (skill: PickedSkill) => void;
  onCancelEditMessage: () => void;
  onShowAllTabsPicker: () => void;
  onToggleAttachedTab: (tab: AttachmentTab) => void;
  onAttachActiveTab: () => Promise<void>;
  onRemoveAttachedTab: (tabId: number) => void;
  onAttachFiles: FileHandler;
  onRemoveUploadedAttachment: (id: string) => void;
  onReplaceUploadedAttachment: ReplaceAttachmentHandler;
  onEditMessage: MessageAttachmentHandler;
  onResendMessage: MessageAttachmentHandler;
  onForkMessage: (message: ChatMessage, partId?: string) => void;
  onSelectElement: () => Promise<void>;
  onSelectChat: (chatId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingPresence = useDeferredPresence(aiWorking);

  function attachFromClipboard(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files).filter(
      (file) => file.size > 0,
    );
    if (!files.length) return;
    event.preventDefault();
    onAttachFiles(files).catch(() => undefined);
  }

  if (!providersReady) return null;

  if (modelCount === 0) return <ProvidersEmptyState t={t} />;
  const sidepanelClass = `sidepanel ${editingMessageId ? "editing-mode" : ""}`;
  // The open chat's list entry stands in while its content loads.
  const currentMeta =
    currentChat ?? chats.find((chat) => chat.id === activeChatId);
  const parentChat = currentMeta?.parentChatId
    ? chats.find((chat) => chat.id === currentMeta.parentChatId)
    : undefined;
  const latestUserMessageId = [...(currentChat?.messages || [])]
    .reverse()
    .find((message) => message.role === "user")?.id;
  const messagesKey = currentChat?.messages.length ? currentChat.id : "empty";

  if (showHistory)
    return (
      <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
        <div className="sidepanel history-mode" ref={sidepanelRef}>
          <HistoryPanel
            t={t}
            chats={chats}
            activeChatId={currentMeta?.id}
            unreadCompletedChatIds={unreadCompletedChatIds}
            agent={activeAgent}
            onSetChats={onSetChats}
            onLoadChat={onLoadChat}
            onImportChat={onImportChat}
            onBack={() => onSetShowHistory(false)}
            onSelect={(chatId) => {
              onSelectChat(chatId);
              onSetShowHistory(false);
            }}
            onClose={onCloseChat}
          />
        </div>
      </TooltipProvider>
    );

  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <div className={sidepanelClass} ref={sidepanelRef}>
        <SidepanelHeader
          t={t}
          currentChat={currentMeta}
          parentChat={parentChat}
          syncWriteStatus={syncWriteStatus}
          onCreateChat={onCreateChat}
          onSetShowHistory={onSetShowHistory}
          onSelectChat={onSelectChat}
        />
        {editingMessageId && (
          <EditModeOverlay t={t} onCancel={onCancelEditMessage} />
        )}
        <div className="messages-shell">
          <div key={messagesKey} ref={messagesRef} className="messages">
            <div className="messages-content">
              <ChatContentStatus
                t={t}
                status={currentChatStatus}
                empty={!currentChat?.messages.length}
                onRetry={onRetryChat}
              />
              {currentChat?.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  t={t}
                  latestUserMessage={message.id === latestUserMessageId}
                  editing={editingMessageId === message.id}
                  sources={currentChat.sources}
                  chats={chats}
                  chatMessages={currentChat.messages}
                  outputActive={message.id === activeAssistantMessageId}
                  sentAttachments={sentAttachmentPreviews[message.id] || []}
                  activeAttachments={uploadedAttachments}
                  onReplaceAttachment={onReplaceUploadedAttachment}
                  onEdit={onEditMessage}
                  onResend={onResendMessage}
                  resendDisabled={streaming}
                  onFork={onForkMessage}
                  onSelectChat={onSelectChat}
                  onAnswerQuestion={onAnswerQuestion}
                />
              ))}
            </div>
          </div>
          <MessageJumpControls
            t={t}
            currentChat={currentChat}
            editingMessageId={editingMessageId}
            messagesRef={messagesRef}
          />
        </div>
        <footer className="composer">
          <UploadFileInput
            inputRef={fileInputRef}
            onAttachFiles={onAttachFiles}
          />
          <div className="skill-create-row">
            {typingPresence.mounted && (
              <TypingIndicator t={t} removing={typingPresence.removing} />
            )}
            <Button
              className="skill-create"
              variant="secondary"
              size="sm"
              disabled={!!editingMessageId}
              onClick={onCreateChat}
            >
              <Plus size={16} /> {t.words.newChat}
            </Button>
          </div>
          <ComposerAttachments
            t={t}
            attachedTabs={attachedTabs}
            pendingAttachments={pendingAttachments}
            selectedSkills={selectedSkills}
            selectedElements={selectedElements}
            attachmentNotice={attachmentNotice}
            onRemoveAttachedTab={onRemoveAttachedTab}
            onRemoveUploadedAttachment={onRemoveUploadedAttachment}
            onRemoveSkill={(skillId) =>
              onSetSelectedSkills(
                selectedSkills.filter((skill) => skill.id !== skillId),
              )
            }
            onSetSelectedElements={onSetSelectedElements}
          />
          <QueuedMessages
            t={t}
            messages={queuedMessages}
            onDelete={onDeleteQueuedMessage}
            onEdit={onEditQueuedMessage}
          />
          <ComposerBox
            t={t}
            input={input}
            composerRef={composerRef}
            editingMessageId={editingMessageId}
            aiWorking={aiWorking}
            streaming={streaming}
            openMenu={openMenu}
            addMenuView={addMenuView}
            availableTabs={availableTabs}
            attachedTabs={attachedTabs}
            activeTabAttachable={activeTabAttachable}
            skills={skills}
            selectedSkills={selectedSkills}
            preferences={preferences}
            configuredModels={configuredModels}
            agents={agents}
            onSetInput={onSetInput}
            onPaste={attachFromClipboard}
            onCancelEditMessage={onCancelEditMessage}
            onSend={onSend}
            onStop={onStop}
            onSetOpenMenu={onSetOpenMenu}
            onSetAddMenuView={onSetAddMenuView}
            onShowAllTabsPicker={onShowAllTabsPicker}
            onToggleSkill={onToggleSkill}
            onPickSkill={(skill) => {
              onSetSelectedSkills(addSkill(selectedSkills, skill));
              onSetInput("");
            }}
            onToggleAttachedTab={onToggleAttachedTab}
            onAttachActiveTab={onAttachActiveTab}
            onAttachFiles={() => fileInputRef.current?.click()}
            onSelectElement={onSelectElement}
            onSetPreferences={onSetPreferences}
          />
        </footer>
      </div>
    </TooltipProvider>
  );
}

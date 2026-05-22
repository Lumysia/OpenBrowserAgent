import { Plus, Send, Square } from "lucide-react";
import {
  useRef,
  type ClipboardEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { TOOLTIP_DELAY_MS } from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import type {
  AttachmentTab,
  Agent,
  Chat,
  ChatMessage,
  ModelConfig,
  Preferences,
  PromptBreakdown,
  SelectedElement,
  Skill,
  UploadedAttachment,
} from "../../src/shared/types";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Textarea,
  TooltipProvider,
} from "../../src/ui/components";
import { AddContextMenu } from "./composer-menus";
import { ComposerSelectors } from "./composer-selectors";
import { ComposerAttachments } from "./composer-attachments";
import { EditModeOverlay } from "./edit-mode-overlay";
import { IconTooltip } from "./icon-tooltip";
import { HistoryPanel } from "./history-panel";
import { MessageBubble } from "./message-bubble";
import { ProvidersEmptyState } from "./providers-empty-state";
import { PromptUsagePreview } from "./prompt-usage-preview";
import { QueuedMessages } from "./queued-messages";
import { SidepanelHeader } from "./sidepanel-header";
import { TypingIndicator } from "./typing-indicator";
import {
  ADD_MENU_VIEW,
  COMPOSER_MENU,
  type AddMenuView,
  type ComposerMenu,
} from "./sidepanel-menu-state";
import type {
  FileHandler,
  MessageAttachmentHandler,
  ReplaceAttachmentHandler,
} from "./sidepanel-view-types";
import { UploadFileInput } from "./uploaded-attachment-card";
import type { QueuedMessage } from "./use-queued-messages";
import { useDeferredPresence } from "./use-deferred-remove";

export function SidepanelView({
  t,
  providersReady,
  modelCount,
  currentChat,
  chats,
  preferences,
  configuredModels,
  input,
  promptUsage,
  activeAgent,
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
  onSetInput,
  onSetOpenMenu,
  onSetAddMenuView,
  onSetShowHistory,
  onSetSelectedElements,
  onSetSelectedSkills,
  onSetChats,
  onSetPreferences,
  onCreateChat,
  onImportChat,
  onCloseChat,
  onSend,
  onStop,
  onDeleteQueuedMessage,
  onEditQueuedMessage,
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
  currentChat?: Chat;
  chats: Chat[];
  preferences?: Preferences;
  configuredModels: ModelConfig[];
  input: string;
  promptUsage: PromptBreakdown;
  activeAgent: Agent;
  attachedTabs: AttachmentTab[];
  pendingAttachments: UploadedAttachment[];
  selectedSkills: Skill[];
  uploadedAttachments: UploadedAttachment[];
  queuedMessages: QueuedMessage[];
  sentAttachmentPreviews: Record<string, UploadedAttachment[]>;
  attachmentNotice: string;
  availableTabs: AttachmentTab[];
  activeTabAttachable: boolean;
  selectedElements: SelectedElement[];
  streaming: boolean;
  unreadCompletedChatIds: Record<string, true>;
  skills: Skill[];
  agents: Agent[];
  openMenu: ComposerMenu | null;
  addMenuView: AddMenuView;
  showHistory: boolean;
  aiWorking: boolean;
  editingMessageId?: string;
  sidepanelRef: RefObject<HTMLDivElement | null>;
  messagesRef: RefObject<HTMLDivElement | null>;
  onSetInput: (value: string) => void;
  onSetOpenMenu: (value: ComposerMenu | null) => void;
  onSetAddMenuView: (value: AddMenuView) => void;
  onSetShowHistory: (value: boolean) => void;
  onSetSelectedElements: (value: SelectedElement[]) => void;
  onSetSelectedSkills: (value: Skill[]) => void;
  onSetChats: Dispatch<SetStateAction<Chat[]>>;
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
  onToggleSkill: (skill: Skill) => void;
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

  function attachFromPicker() {
    fileInputRef.current?.click();
  }

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
  const parentChat = currentChat?.parentChatId
    ? chats.find((chat) => chat.id === currentChat.parentChatId)
    : undefined;
  const latestUserMessageId = [...(currentChat?.messages || [])]
    .reverse()
    .find((message) => message.role === "user")?.id;

  if (showHistory)
    return (
      <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
        <div className="sidepanel history-mode" ref={sidepanelRef}>
          <HistoryPanel
            t={t}
            chats={chats}
            activeChatId={currentChat?.id}
            unreadCompletedChatIds={unreadCompletedChatIds}
            agent={activeAgent}
            preferences={preferences}
            onSetChats={onSetChats}
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
          currentChat={currentChat}
          parentChat={parentChat}
          onCreateChat={onCreateChat}
          onSetShowHistory={onSetShowHistory}
          onSelectChat={onSelectChat}
        />
        {editingMessageId && (
          <EditModeOverlay t={t} onCancel={onCancelEditMessage} />
        )}
        <ScrollArea className="messages" viewportRef={messagesRef}>
          {!currentChat?.messages.length && (
            <div className="empty">
              <div>
                <h2>{t.sidepanel.whatDoYouWant}</h2>
                <p className="muted">{t.sidepanel.emptyDescription}</p>
              </div>
            </div>
          )}
          {currentChat?.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              latestUserMessage={message.id === latestUserMessageId}
              editing={editingMessageId === message.id}
              sources={currentChat.sources || []}
              chatMessages={currentChat.messages}
              sentAttachments={sentAttachmentPreviews[message.id] || []}
              activeAttachments={uploadedAttachments}
              onReplaceAttachment={onReplaceUploadedAttachment}
              onEdit={onEditMessage}
              onResend={onResendMessage}
              resendDisabled={streaming}
              onFork={onForkMessage}
              onSelectChat={onSelectChat}
            />
          ))}
        </ScrollArea>
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
          <div className="composer-box">
            <PromptUsagePreview estimate={promptUsage} t={t} />
            <Textarea
              value={input}
              placeholder={t.sidepanel.whatDoYouWant}
              onChange={(event) => onSetInput(event.target.value)}
              onPaste={attachFromClipboard}
              onKeyDown={(event) => {
                if (
                  event.key === "Escape" &&
                  editingMessageId &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  onCancelEditMessage();
                  return;
                }
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.metaKey &&
                  !event.ctrlKey
                ) {
                  event.preventDefault();
                  onSend();
                }
              }}
            />
            <div className="composer-controls">
              <div className="composer-left">
                <Popover
                  open={openMenu === COMPOSER_MENU.add}
                  onOpenChange={(open) => {
                    if (open) {
                      onSetAddMenuView(ADD_MENU_VIEW.menu);
                      onSetOpenMenu(COMPOSER_MENU.add);
                    } else {
                      onSetOpenMenu(null);
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      className="composer-icon-button"
                      variant="outline"
                      size="icon"
                      disabled={aiWorking}
                    >
                      <Plus size={20} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="start"
                    className="add-context-popover-content"
                  >
                    <AddContextMenu
                      t={t}
                      view={addMenuView}
                      tabs={availableTabs}
                      skills={skills}
                      selectedSkillIds={selectedSkills.map((skill) => skill.id)}
                      selectedTabIds={attachedTabs.map((tab) => tab.id)}
                      activeTabAttachable={activeTabAttachable}
                      onShowTabs={onShowAllTabsPicker}
                      onShowSkills={() =>
                        onSetAddMenuView(ADD_MENU_VIEW.skills)
                      }
                      onSkill={onToggleSkill}
                      onUploadFiles={() => {
                        attachFromPicker();
                        onSetOpenMenu(null);
                      }}
                      onToggleTab={onToggleAttachedTab}
                      onAttachTab={async () => {
                        await onAttachActiveTab();
                        onSetOpenMenu(null);
                      }}
                      onSelectElement={async () => {
                        await onSelectElement();
                        onSetOpenMenu(null);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <ComposerSelectors
                t={t}
                preferences={preferences}
                configuredModels={configuredModels}
                agents={agents}
                openMenu={openMenu}
                aiWorking={aiWorking}
                onSetOpenMenu={onSetOpenMenu}
                onSetPreferences={onSetPreferences}
              />
              {streaming ? (
                <>
                  <IconTooltip label={t.sidepanel.stop}>
                    <Button
                      className="send-button stop-button"
                      variant="secondary"
                      onClick={onStop}
                    >
                      <Square size={18} />
                    </Button>
                  </IconTooltip>
                  <IconTooltip label={t.sidepanel.queueMessage}>
                    <Button className="send-button" onClick={() => onSend()}>
                      <Send size={20} />
                    </Button>
                  </IconTooltip>
                </>
              ) : (
                <IconTooltip label={t.sidepanel.send}>
                  <Button className="send-button" onClick={() => onSend()}>
                    <Send size={20} />
                  </Button>
                </IconTooltip>
              )}
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}

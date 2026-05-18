import { Plus, Send, Square } from "lucide-react";
import { useRef, type ClipboardEvent, type RefObject } from "react";
import type { Messages } from "../../src/shared/i18n";
import { CHAT_MODE } from "../../src/shared/types";
import type {
  AttachmentTab,
  Chat,
  ChatMessage,
  ChatMode,
  ModelConfig,
  Preferences,
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
import {
  AddContextMenu,
  ModelMenu,
  ModeMenu,
  modeIcon,
  selectedModelLabel,
} from "./composer-menus";
import { ComposerAttachments } from "./composer-attachments";
import { IconTooltip } from "./icon-tooltip";
import { MessageBubble } from "./message-bubble";
import { ProvidersEmptyState } from "./providers-empty-state";
import { QueuedMessages } from "./queued-messages";
import { SidepanelHeader } from "./sidepanel-header";
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
import { aiWorkingStatus } from "./working-status";
import type { QueuedMessage } from "./use-queued-messages";

export function SidepanelView({
  t,
  providersReady,
  modelCount,
  currentChat,
  chats,
  preferences,
  configuredModels,
  input,
  mode,
  attachedTabs,
  pendingAttachments,
  selectedSkill,
  uploadedAttachments,
  queuedMessages,
  sentAttachmentPreviews,
  attachmentNotice,
  availableTabs,
  selectedElement,
  streaming,
  creatingSkill,
  skillCreated,
  skills,
  openMenu,
  addMenuView,
  showHistory,
  aiWorking,
  editingMessageId,
  sidepanelRef,
  messagesRef,
  onSetInput,
  onSetMode,
  onSetOpenMenu,
  onSetAddMenuView,
  onSetShowHistory,
  onSetSelectedElement,
  onSetSelectedSkill,
  onSetChats,
  onSetPreferences,
  onCreateChat,
  onImportChat,
  onCloseChat,
  onCreateSkill,
  onSend,
  onStop,
  onDeleteQueuedMessage,
  onEditQueuedMessage,
  onSelectSkill,
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
  mode: ChatMode;
  attachedTabs: AttachmentTab[];
  pendingAttachments: UploadedAttachment[];
  selectedSkill?: Skill | null;
  uploadedAttachments: UploadedAttachment[];
  queuedMessages: QueuedMessage[];
  sentAttachmentPreviews: Record<string, UploadedAttachment[]>;
  attachmentNotice: string;
  availableTabs: AttachmentTab[];
  selectedElement: SelectedElement | null;
  streaming: boolean;
  creatingSkill: boolean;
  skillCreated: boolean;
  skills: Skill[];
  openMenu: ComposerMenu | null;
  addMenuView: AddMenuView;
  showHistory: boolean;
  aiWorking: boolean;
  editingMessageId?: string;
  sidepanelRef: RefObject<HTMLDivElement | null>;
  messagesRef: RefObject<HTMLDivElement | null>;
  onSetInput: (value: string) => void;
  onSetMode: (value: ChatMode) => void;
  onSetOpenMenu: (value: ComposerMenu | null) => void;
  onSetAddMenuView: (value: AddMenuView) => void;
  onSetShowHistory: (value: boolean) => void;
  onSetSelectedElement: (value: SelectedElement | null) => void;
  onSetSelectedSkill: (value: Skill | null) => void;
  onSetChats: (value: Chat[]) => void;
  onSetPreferences: (
    value: Preferences | ((previous: Preferences) => Preferences),
  ) => void;
  onCreateChat: () => void;
  onImportChat: (chat: Chat) => void;
  onCloseChat: (chatId: string) => void;
  onCreateSkill: () => void;
  onSend: () => void;
  onStop: () => void;
  onDeleteQueuedMessage: (id: string) => void;
  onEditQueuedMessage: (message: QueuedMessage) => void;
  onSelectSkill: (skill: Skill) => void;
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
  onSelectElement: () => Promise<void>;
  onSelectChat: (chatId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workingStatus = aiWorkingStatus({
    chat: currentChat,
    creatingSkill,
    t,
  });

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

  if (modelCount === 0) {
    return <ProvidersEmptyState t={t} />;
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="sidepanel" ref={sidepanelRef}>
        <SidepanelHeader
          t={t}
          currentChat={currentChat}
          mode={mode}
          preferences={preferences}
          chats={chats}
          showHistory={showHistory}
          onSetChats={onSetChats}
          onCreateChat={onCreateChat}
          onImportChat={onImportChat}
          onSetShowHistory={onSetShowHistory}
          onSelectChat={onSelectChat}
          onCloseChat={onCloseChat}
        />
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
              editing={editingMessageId === message.id}
              sources={currentChat.sources || []}
              sentAttachments={sentAttachmentPreviews[message.id] || []}
              activeAttachments={uploadedAttachments}
              onReplaceAttachment={onReplaceUploadedAttachment}
              onEdit={onEditMessage}
              onResend={onResendMessage}
            />
          ))}
        </ScrollArea>
        <footer className="composer">
          <UploadFileInput
            inputRef={fileInputRef}
            onAttachFiles={onAttachFiles}
          />
          <div className="skill-create-row">
            <Button
              className="skill-create"
              variant="secondary"
              size="sm"
              disabled={creatingSkill}
              onClick={onCreateSkill}
            >
              <Plus size={16} />{" "}
              {creatingSkill
                ? t.sidepanel.generatingSkill
                : skillCreated
                  ? t.sidepanel.skillCreated
                  : t.sidepanel.createSkill}
            </Button>
          </div>
          <ComposerAttachments
            t={t}
            attachedTabs={attachedTabs}
            pendingAttachments={pendingAttachments}
            selectedSkill={selectedSkill}
            selectedElement={selectedElement}
            attachmentNotice={attachmentNotice}
            onRemoveAttachedTab={onRemoveAttachedTab}
            onRemoveUploadedAttachment={onRemoveUploadedAttachment}
            onClearSkill={() => onSetSelectedSkill(null)}
            onSetSelectedElement={onSetSelectedElement}
          />
          <QueuedMessages
            t={t}
            messages={queuedMessages}
            onDelete={onDeleteQueuedMessage}
            onEdit={onEditQueuedMessage}
          />
          {aiWorking && (
            <div className="ai-working-overlay" aria-live="polite">
              <span className="ai-working-orb" />
              <span>
                <strong>{workingStatus.title}</strong>
                <small>{workingStatus.description}</small>
              </span>
              <span className="ai-working-bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
          <div className="composer-box">
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
                      selectedTabIds={attachedTabs.map((tab) => tab.id)}
                      onShowTabs={onShowAllTabsPicker}
                      onShowSkills={() =>
                        onSetAddMenuView(ADD_MENU_VIEW.skills)
                      }
                      onSkill={(skill) => {
                        onSelectSkill(skill);
                        onSetOpenMenu(null);
                      }}
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
              <div className="composer-selectors">
                <div className="selector-anchor model-anchor">
                  <Popover
                    open={openMenu === COMPOSER_MENU.model}
                    onOpenChange={(open) =>
                      onSetOpenMenu(open ? COMPOSER_MENU.model : null)
                    }
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="composer-trigger composer-model-trigger"
                        disabled={aiWorking}
                      >
                        {selectedModelLabel(
                          preferences?.selectedModelId,
                          configuredModels,
                          t,
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="model-popover-content"
                      align="end"
                    >
                      <ModelMenu
                        t={t}
                        models={configuredModels}
                        selectedModelId={preferences?.selectedModelId}
                        onSelect={(modelId) => {
                          if (preferences)
                            onSetPreferences((previous) => ({
                              ...previous,
                              selectedModelId: modelId,
                            }));
                          onSetOpenMenu(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="selector-anchor mode-anchor">
                  <Popover
                    open={openMenu === COMPOSER_MENU.mode}
                    onOpenChange={(open) =>
                      onSetOpenMenu(open ? COMPOSER_MENU.mode : null)
                    }
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="composer-trigger composer-mode-trigger"
                        disabled={aiWorking}
                        title={
                          mode === CHAT_MODE.agent ? t.words.agent : t.words.ask
                        }
                      >
                        {modeIcon(mode)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="mode-popover-content"
                      align="end"
                    >
                      <ModeMenu
                        t={t}
                        mode={mode}
                        onSelect={(nextMode) => {
                          onSetMode(nextMode);
                          onSetOpenMenu(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
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
                  <Button
                    className="send-button"
                    disabled={creatingSkill}
                    onClick={() => onSend()}
                  >
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

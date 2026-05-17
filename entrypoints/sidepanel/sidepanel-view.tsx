import {
  Bot,
  ChevronDown,
  History,
  MessageCirclePlus,
  MousePointerClick,
  Plus,
  Send,
  Settings,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { RefObject } from "react";
import type { Messages } from "../../src/shared/i18n";
import { CHAT_MODE } from "../../src/shared/types";
import type {
  AttachmentTab,
  Chat,
  ChatMode,
  ModelConfig,
  Preferences,
  QuickAction,
  SelectedElement,
} from "../../src/shared/types";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Textarea,
  TooltipProvider,
} from "../../src/ui/components";
import {
  AddContextMenu,
  AttachedTabCard,
  ModelMenu,
  ModeMenu,
  selectedModelLabel,
} from "./composer-menus";
import { HistoryPanel } from "./history-panel";
import { IconTooltip } from "./icon-tooltip";
import { MessageBubble } from "./message-bubble";

export const COMPOSER_MENU = {
  add: "add",
  model: "model",
  mode: "mode",
} as const;

export type ComposerMenu = (typeof COMPOSER_MENU)[keyof typeof COMPOSER_MENU];

export const ADD_MENU_VIEW = {
  menu: "menu",
  tabs: "tabs",
} as const;

type AddMenuView = (typeof ADD_MENU_VIEW)[keyof typeof ADD_MENU_VIEW];

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
  availableTabs,
  selectedElement,
  streaming,
  creatingQuickAction,
  quickActionCreated,
  quickActions,
  openMenu,
  addMenuView,
  showHistory,
  aiWorking,
  sidepanelRef,
  messagesRef,
  onSetInput,
  onSetMode,
  onSetOpenMenu,
  onSetAddMenuView,
  onSetShowHistory,
  onSetSelectedElement,
  onSetChats,
  onSetPreferences,
  onCreateChat,
  onCloseChat,
  onCreateQuickAction,
  onSend,
  onStop,
  onShowAllTabsPicker,
  onToggleAttachedTab,
  onAttachActiveTab,
  onRemoveAttachedTab,
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
  availableTabs: AttachmentTab[];
  selectedElement: SelectedElement | null;
  streaming: boolean;
  creatingQuickAction: boolean;
  quickActionCreated: boolean;
  quickActions: QuickAction[];
  openMenu: ComposerMenu | null;
  addMenuView: AddMenuView;
  showHistory: boolean;
  aiWorking: boolean;
  sidepanelRef: RefObject<HTMLDivElement | null>;
  messagesRef: RefObject<HTMLDivElement | null>;
  onSetInput: (value: string) => void;
  onSetMode: (value: ChatMode) => void;
  onSetOpenMenu: (value: ComposerMenu | null) => void;
  onSetAddMenuView: (value: AddMenuView) => void;
  onSetShowHistory: (value: boolean) => void;
  onSetSelectedElement: (value: SelectedElement | null) => void;
  onSetChats: (value: Chat[]) => void;
  onSetPreferences: (value: Preferences) => void;
  onCreateChat: () => void;
  onCloseChat: (chatId: string) => void;
  onCreateQuickAction: () => void;
  onSend: (content?: string, quickAction?: QuickAction) => void;
  onStop: () => void;
  onShowAllTabsPicker: () => void;
  onToggleAttachedTab: (tab: AttachmentTab) => void;
  onAttachActiveTab: () => Promise<void>;
  onRemoveAttachedTab: (tabId: number) => void;
  onSelectElement: () => Promise<void>;
  onSelectChat: (chatId: string) => void;
}) {
  if (providersReady && modelCount === 0) {
    return (
      <div className="sidepanel">
        <div className="empty">
          <Card className="stack" style={{ maxWidth: 320 }}>
            <CardHeader>
              <Bot size={34} />
              <CardTitle>{t.sidepanel.connectProviderTitle}</CardTitle>
              <CardDescription>
                {t.sidepanel.connectProviderDescription}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => chrome.runtime.openOptionsPage()}>
                {t.sidepanel.addProvider}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="sidepanel" ref={sidepanelRef}>
        <header className="sidepanel-header">
          <div className="sidepanel-topbar">
            <IconTooltip label={t.sidepanel.clearAllChats}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSetChats([])}
              >
                <Trash2 size={18} />
              </Button>
            </IconTooltip>
            <div />
            <div className="topbar-actions">
              <IconTooltip label={t.words.newChat}>
                <Button variant="ghost" size="icon" onClick={onCreateChat}>
                  <MessageCirclePlus size={18} />
                </Button>
              </IconTooltip>
              <Popover open={showHistory} onOpenChange={onSetShowHistory}>
                <IconTooltip label={t.sidepanel.chatHistory}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <History size={18} />
                    </Button>
                  </PopoverTrigger>
                </IconTooltip>
                <PopoverContent align="end" className="history-popover-content">
                  <HistoryPanel
                    t={t}
                    chats={chats}
                    activeChatId={currentChat?.id}
                    onSelect={(chatId) => {
                      onSelectChat(chatId);
                      onSetShowHistory(false);
                    }}
                    onClose={onCloseChat}
                  />
                </PopoverContent>
              </Popover>
              <IconTooltip label={t.common.settings}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => chrome.runtime.openOptionsPage()}
                >
                  <Settings size={18} />
                </Button>
              </IconTooltip>
            </div>
          </div>
        </header>
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
            <MessageBubble key={message.id} message={message} />
          ))}
        </ScrollArea>
        <footer className="composer">
          <div className="quick-action-create-row">
            <Button
              className="quick-action-create"
              variant="secondary"
              size="sm"
              disabled={creatingQuickAction}
              onClick={onCreateQuickAction}
            >
              <Plus size={16} />{" "}
              {creatingQuickAction
                ? t.sidepanel.generatingQuickAction
                : quickActionCreated
                  ? t.sidepanel.quickActionCreated
                  : t.sidepanel.createQuickAction}
            </Button>
          </div>
          <div className="context-strip">
            <div className="context-chip-row">
              {attachedTabs.map((tab) => (
                <AttachedTabCard
                  key={tab.id}
                  t={t}
                  tab={tab}
                  onRemove={() => onRemoveAttachedTab(tab.id)}
                />
              ))}
            </div>
            {selectedElement && (
              <div className="context-card">
                <MousePointerClick size={18} />
                <span>
                  <strong>
                    {selectedElement.tagName || t.sidepanel.elementSelected}
                  </strong>
                  <small>{t.sidepanel.willBeSentAsPageContext}</small>
                </span>
                <button
                  className="context-close"
                  title={t.sidepanel.selectElement}
                  onClick={() => onSetSelectedElement(null)}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
          <div className="composer-box">
            {aiWorking && (
              <div className="ai-working-overlay" aria-live="polite">
                <span className="ai-working-orb" />
                <span>
                  <strong>
                    {creatingQuickAction
                      ? t.sidepanel.generatingQuickAction
                      : t.sidepanel.aiWorking}
                  </strong>
                  <small>{t.sidepanel.aiWorkingDescription}</small>
                </span>
                <span className="ai-working-bars" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
            <Textarea
              value={input}
              placeholder={t.sidepanel.whatDoYouWant}
              disabled={aiWorking}
              onChange={(event) => onSetInput(event.target.value)}
              onKeyDown={(event) => {
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
                  <PopoverContent className="add-context-popover-content">
                    <AddContextMenu
                      t={t}
                      view={addMenuView}
                      tabs={availableTabs}
                      quickActions={quickActions}
                      selectedTabIds={attachedTabs.map((tab) => tab.id)}
                      onShowTabs={onShowAllTabsPicker}
                      onQuickAction={(action) => {
                        onSend(action.instruction, action);
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
                      <button className="composer-trigger" disabled={aiWorking}>
                        {selectedModelLabel(
                          preferences?.selectedModelId,
                          configuredModels,
                          t,
                        )}{" "}
                        <ChevronDown size={15} />
                      </button>
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
                            onSetPreferences({
                              ...preferences,
                              selectedModelId: modelId,
                            });
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
                      <button className="composer-trigger" disabled={aiWorking}>
                        {mode === CHAT_MODE.agent ? t.words.agent : t.words.ask}{" "}
                        <ChevronDown size={15} />
                      </button>
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
                <IconTooltip label={t.sidepanel.stop}>
                  <Button className="send-button" onClick={onStop}>
                    <Square size={18} />
                  </Button>
                </IconTooltip>
              ) : (
                <IconTooltip label={t.sidepanel.send}>
                  <Button
                    className="send-button"
                    disabled={creatingQuickAction}
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

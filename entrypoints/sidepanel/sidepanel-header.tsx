import {
  Download,
  History,
  MessageCirclePlus,
  Settings,
  Trash2,
} from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import type { Chat, ChatMode, Preferences } from "../../src/shared/types";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../src/ui/components";
import { exportChatAsOpenAiJson } from "./chat-export";
import { HistoryPanel } from "./history-panel";
import { IconTooltip } from "./icon-tooltip";

export function SidepanelHeader({
  t,
  currentChat,
  mode,
  preferences,
  chats,
  showHistory,
  onSetChats,
  onCreateChat,
  onSetShowHistory,
  onSelectChat,
  onCloseChat,
}: {
  t: Messages;
  currentChat?: Chat;
  mode: ChatMode;
  preferences?: Preferences;
  chats: Chat[];
  showHistory: boolean;
  onSetChats: (value: Chat[]) => void;
  onCreateChat: () => void;
  onSetShowHistory: (value: boolean) => void;
  onSelectChat: (chatId: string) => void;
  onCloseChat: (chatId: string) => void;
}) {
  return (
    <header className="sidepanel-header">
      <div className="sidepanel-topbar">
        <IconTooltip label={t.sidepanel.clearAllChats}>
          <Button variant="ghost" size="icon" onClick={() => onSetChats([])}>
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
          <IconTooltip label={t.sidepanel.exportChatOpenAi}>
            <Button
              variant="ghost"
              size="icon"
              disabled={!currentChat?.messages.length}
              onClick={() =>
                exportChatAsOpenAiJson(currentChat, mode, preferences)
              }
            >
              <Download size={18} />
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
  );
}

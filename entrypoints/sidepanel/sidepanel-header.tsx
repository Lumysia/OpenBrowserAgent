import { ArrowLeft, History, MessageCirclePlus, Settings } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import type { Chat } from "../../src/shared/types";
import { chatDisplayTitle } from "../../src/ui/agent-display";
import { Button } from "../../src/ui/components";
import { IconTooltip } from "./icon-tooltip";

export function SidepanelHeader({
  t,
  currentChat,
  parentChat,
  onCreateChat,
  onSetShowHistory,
  onSelectChat,
}: {
  t: Messages;
  currentChat?: Chat;
  parentChat?: Chat;
  onCreateChat: () => void;
  onSetShowHistory: (value: boolean) => void;
  onSelectChat: (chatId: string) => void;
}) {
  return (
    <header className="sidepanel-header">
      <div className="sidepanel-topbar">
        {parentChat ? (
          <IconTooltip label={t.sidepanel.backToParentChat}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSelectChat(parentChat.id)}
            >
              <ArrowLeft size={18} />
            </Button>
          </IconTooltip>
        ) : (
          <IconTooltip label={t.common.settings}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openOrFocusOptions().catch(console.warn)}
            >
              <Settings size={18} />
            </Button>
          </IconTooltip>
        )}
        <div className="sidepanel-chat-context">
          {parentChat && (
            <>
              <strong>{t.sidepanel.subAgentChat}</strong>
              <small>
                {chatDisplayTitle(currentChat, t)} ·{" "}
                {chatDisplayTitle(parentChat, t)}
              </small>
            </>
          )}
        </div>
        <div className="topbar-actions">
          <IconTooltip label={t.sidepanel.chatHistory}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSetShowHistory(true)}
            >
              <History size={18} />
            </Button>
          </IconTooltip>
          <IconTooltip label={t.words.newChat}>
            <Button variant="ghost" size="icon" onClick={onCreateChat}>
              <MessageCirclePlus size={18} />
            </Button>
          </IconTooltip>
        </div>
      </div>
    </header>
  );
}

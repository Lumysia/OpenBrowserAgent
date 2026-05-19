import { ArrowLeft, Download, Trash2, Upload, X } from "lucide-react";
import { useRef } from "react";
import type { Messages } from "../../src/shared/i18n";
import type { Chat, ChatMode, Preferences } from "../../src/shared/types";
import { Button } from "../../src/ui/components";
import {
  exportChatAsOpenAiJson,
  importChatFromOpenAiJson,
} from "./chat-export";
import { IconTooltip } from "./icon-tooltip";
import {
  formatMessageCount,
  formatRelativeTime,
  sortChatsNewestFirst,
} from "./format";

export function HistoryPanel({
  t,
  chats,
  activeChatId,
  mode,
  preferences,
  onSetChats,
  onImportChat,
  onSelect,
  onClose,
  onBack,
}: {
  t: Messages;
  chats: Chat[];
  activeChatId?: string;
  mode: ChatMode;
  preferences?: Preferences;
  onSetChats: (value: Chat[]) => void;
  onImportChat: (chat: Chat) => void;
  onSelect: (chatId: string) => void;
  onClose: (chatId: string) => void;
  onBack: () => void;
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const sortedChats = sortChatsNewestFirst(chats);

  async function importChat(file: File | undefined) {
    if (!file) return;
    try {
      onImportChat(await importChatFromOpenAiJson(file));
    } catch (error) {
      console.warn("Failed to import chat", error);
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  return (
    <div className="history-page">
      <div className="history-page-header">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <strong>{t.sidepanel.chatHistory}</strong>
          <small>{formatMessageCount(t, chats.length)}</small>
        </div>
        <div className="history-page-actions">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(event) => void importChat(event.target.files?.[0])}
          />
          <IconTooltip label={t.sidepanel.importChatOpenAi}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload size={18} />
            </Button>
          </IconTooltip>
          <IconTooltip label={t.sidepanel.clearAllChats}>
            <Button
              variant="ghost"
              size="icon"
              className="history-danger-action"
              onClick={() => onSetChats([])}
            >
              <Trash2 size={18} />
            </Button>
          </IconTooltip>
        </div>
      </div>
      <div className="history-panel">
        {!chats.length && (
          <div className="history-empty">{t.sidepanel.noChatsYet}</div>
        )}
        {sortedChats.map((chat) => (
          <div
            className={`history-item ${chat.id === activeChatId ? "active" : ""}`}
            key={chat.id}
          >
            <Button
              variant="ghost"
              className="history-select"
              onClick={() => onSelect(chat.id)}
            >
              <strong>{chat.title || t.words.newChat}</strong>
              <small>
                {formatMessageCount(t, chat.messages.length)} ·{" "}
                {formatRelativeTime(t, chat.updatedAt)}
              </small>
            </Button>
            <div className="history-item-actions">
              <IconTooltip label={t.sidepanel.exportChatOpenAi}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="history-item-action"
                  aria-label={t.sidepanel.exportChatOpenAi}
                  disabled={!chat.messages.length}
                  onClick={() =>
                    exportChatAsOpenAiJson(chat, mode, preferences)
                  }
                >
                  <Download size={13} />
                </Button>
              </IconTooltip>
              <IconTooltip label={t.sidepanel.removeChat}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="history-item-action"
                  aria-label={t.sidepanel.removeChat}
                  onClick={() => onClose(chat.id)}
                >
                  <X size={13} />
                </Button>
              </IconTooltip>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

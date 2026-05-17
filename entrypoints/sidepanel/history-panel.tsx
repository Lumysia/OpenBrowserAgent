import { X } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import type { Chat } from "../../src/shared/types";
import {
  formatMessageCount,
  formatRelativeTime,
  sortChatsNewestFirst,
} from "./format";

export function HistoryPanel({
  t,
  chats,
  activeChatId,
  onSelect,
  onClose,
}: {
  t: Messages;
  chats: Chat[];
  activeChatId?: string;
  onSelect: (chatId: string) => void;
  onClose: (chatId: string) => void;
}) {
  const sortedChats = sortChatsNewestFirst(chats);
  return (
    <div className="history-panel">
      <div className="history-panel-header">{t.sidepanel.chatHistory}</div>
      {!chats.length && (
        <div className="history-empty">{t.sidepanel.noChatsYet}</div>
      )}
      {sortedChats.map((chat) => (
        <div
          className={`history-item ${chat.id === activeChatId ? "active" : ""}`}
          key={chat.id}
        >
          <button onClick={() => onSelect(chat.id)}>
            <strong>{chat.title || t.words.newChat}</strong>
            <small>
              {formatMessageCount(t, chat.messages.length)} ·{" "}
              {formatRelativeTime(t, chat.updatedAt)}
            </small>
          </button>
          <button
            className="history-close"
            title={t.sidepanel.closeChat}
            onClick={() => onClose(chat.id)}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

import { ArrowLeft, Download, Pencil, Trash2, Upload, X } from "lucide-react";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Messages } from "../../src/shared/i18n";
import type { Chat, ChatMode, Preferences } from "../../src/shared/types";
import { Button, Input, ScrollArea } from "../../src/ui/components";
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
  unreadCompletedChatIds,
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
  unreadCompletedChatIds: Record<string, true>;
  mode: ChatMode;
  preferences?: Preferences;
  onSetChats: Dispatch<SetStateAction<Chat[]>>;
  onImportChat: (chat: Chat) => void;
  onSelect: (chatId: string) => void;
  onClose: (chatId: string) => void;
  onBack: () => void;
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [editingChatId, setEditingChatId] = useState<string>();
  const [draftTitle, setDraftTitle] = useState("");
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

  function startEdit(chat: Chat) {
    setEditingChatId(chat.id);
    setDraftTitle(chat.title || t.words.newChat);
  }

  function saveEdit(chatId: string) {
    const title = draftTitle.trim();
    if (title)
      onSetChats((items) =>
        items.map((chat) =>
          chat.id === chatId ? { ...chat, title, updatedAt: Date.now() } : chat,
        ),
      );
    setEditingChatId(undefined);
    setDraftTitle("");
  }

  function cancelEdit() {
    setEditingChatId(undefined);
    setDraftTitle("");
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
      <ScrollArea className="history-panel">
        {!chats.length && (
          <div className="history-empty">{t.sidepanel.noChatsYet}</div>
        )}
        {sortedChats.map((chat) => (
          <div
            className={`history-item ${chat.id === activeChatId ? "active" : ""} ${unreadCompletedChatIds[chat.id] ? "unread-complete" : ""}`}
            key={chat.id}
          >
            {editingChatId === chat.id ? (
              <div className="history-select history-title-editor">
                <Input
                  className="history-title-input"
                  value={draftTitle}
                  aria-label={t.common.edit}
                  autoFocus
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={() => saveEdit(chat.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveEdit(chat.id);
                    if (event.key === "Escape") cancelEdit();
                  }}
                />
                <small>
                  {formatMessageCount(t, chat.messages.length)} ·{" "}
                  {formatRelativeTime(t, chat.updatedAt)}
                </small>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="history-select"
                onClick={() => onSelect(chat.id)}
              >
                <span className="history-title-row">
                  {unreadCompletedChatIds[chat.id] && (
                    <span className="history-unread-dot" aria-hidden="true" />
                  )}
                  <strong>{chat.title || t.words.newChat}</strong>
                </span>
                <small>
                  {formatMessageCount(t, chat.messages.length)} ·{" "}
                  {formatRelativeTime(t, chat.updatedAt)}
                </small>
              </Button>
            )}
            <div className="history-item-actions">
              <IconTooltip label={t.common.edit}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="history-item-action"
                  aria-label={t.common.edit}
                  onClick={() => startEdit(chat)}
                >
                  <Pencil size={13} />
                </Button>
              </IconTooltip>
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
      </ScrollArea>
    </div>
  );
}

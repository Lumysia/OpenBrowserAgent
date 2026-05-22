import { ArrowLeft, Download, Pencil, Trash2, Upload, X } from "lucide-react";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Messages } from "../../src/shared/i18n";
import type { Agent, Chat, Preferences } from "../../src/shared/types";
import { chatDisplayTitle } from "../../src/ui/agent-display";
import { Badge, Button, Input, ScrollArea } from "../../src/ui/components";
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
  agent,
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
  agent: Agent;
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
  const chatsByParentId = new Map<string, Chat[]>();
  for (const chat of sortedChats) {
    if (!chat.parentChatId) continue;
    chatsByParentId.set(chat.parentChatId, [
      ...(chatsByParentId.get(chat.parentChatId) || []),
      chat,
    ]);
  }
  const rootChats = sortedChats.filter(
    (chat) =>
      !chat.parentChatId ||
      !chats.some((item) => item.id === chat.parentChatId),
  );

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
    setDraftTitle(chatDisplayTitle(chat, t));
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
        {rootChats.map((chat) => (
          <div className="history-thread" key={chat.id}>
            <HistoryItem
              t={t}
              chat={chat}
              activeChatId={activeChatId}
              unreadCompletedChatIds={unreadCompletedChatIds}
              editingChatId={editingChatId}
              draftTitle={draftTitle}
              agent={agent}
              preferences={preferences}
              onSetDraftTitle={setDraftTitle}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
              onSelect={onSelect}
              onClose={onClose}
            />
            {!!chatsByParentId.get(chat.id)?.length && (
              <div className="history-child-list">
                {chatsByParentId.get(chat.id)?.map((child) => (
                  <HistoryItem
                    key={child.id}
                    t={t}
                    chat={child}
                    activeChatId={activeChatId}
                    unreadCompletedChatIds={unreadCompletedChatIds}
                    editingChatId={editingChatId}
                    draftTitle={draftTitle}
                    agent={agent}
                    preferences={preferences}
                    child
                    onSetDraftTitle={setDraftTitle}
                    onStartEdit={startEdit}
                    onSaveEdit={saveEdit}
                    onCancelEdit={cancelEdit}
                    onSelect={onSelect}
                    onClose={onClose}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}

function HistoryItem({
  t,
  chat,
  activeChatId,
  unreadCompletedChatIds,
  editingChatId,
  draftTitle,
  agent,
  preferences,
  child = false,
  onSetDraftTitle,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onSelect,
  onClose,
}: {
  t: Messages;
  chat: Chat;
  activeChatId?: string;
  unreadCompletedChatIds: Record<string, true>;
  editingChatId?: string;
  draftTitle: string;
  agent: Agent;
  preferences?: Preferences;
  child?: boolean;
  onSetDraftTitle: (value: string) => void;
  onStartEdit: (chat: Chat) => void;
  onSaveEdit: (chatId: string) => void;
  onCancelEdit: () => void;
  onSelect: (chatId: string) => void;
  onClose: (chatId: string) => void;
}) {
  const status = chatStatus(chat);
  const title = chatDisplayTitle(chat, t);
  return (
    <div
      className={`history-item ${child ? "child" : ""} ${chat.id === activeChatId ? "active" : ""} ${unreadCompletedChatIds[chat.id] ? "unread-complete" : ""}`}
    >
      {editingChatId === chat.id ? (
        <div className="history-select history-title-editor">
          <Input
            className="history-title-input"
            value={draftTitle}
            aria-label={t.common.edit}
            autoFocus
            onChange={(event) => onSetDraftTitle(event.target.value)}
            onBlur={() => onSaveEdit(chat.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSaveEdit(chat.id);
              if (event.key === "Escape") onCancelEdit();
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
            {!child && unreadCompletedChatIds[chat.id] && (
              <span className="history-unread-dot" aria-hidden="true" />
            )}
            {child && <Badge>{t.sidepanel.subAgentBadge}</Badge>}
            <strong>{title}</strong>
          </span>
          <small>
            {formatMessageCount(t, chat.messages.length)} ·{" "}
            {formatRelativeTime(t, chat.updatedAt)}
            {child &&
              ` · ${status === "running" ? t.sidepanel.subAgentRunning : t.sidepanel.subAgentCompleted}`}
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
            onClick={() => onStartEdit(chat)}
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
            onClick={() => exportChatAsOpenAiJson(chat, agent, preferences)}
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
  );
}

function chatStatus(chat: Chat) {
  const assistant = [...chat.messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const metrics = assistant?.metadata?.runMetrics as
    | { endedAt?: unknown }
    | undefined;
  return metrics?.endedAt ? "completed" : "running";
}

import { ArrowLeft, Download, Pencil, Trash2, Upload, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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

const HISTORY_REMOVE_DELAY_MS = 190;

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
  const removeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [editingChatId, setEditingChatId] = useState<string>();
  const [draftTitle, setDraftTitle] = useState("");
  const [removingChatIds, setRemovingChatIds] = useState<Record<string, true>>(
    {},
  );
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

  function closeWithExit(chatId: string) {
    if (removingChatIds[chatId]) return;
    const ids = linkedClosedChatIds(chats, chatId);
    setRemovingChatIds((items) => ({
      ...items,
      ...Object.fromEntries([...ids].map((id) => [id, true as const])),
    }));
    const timer = setTimeout(() => {
      onClose(chatId);
      setRemovingChatIds((items) => {
        const next = { ...items };
        ids.forEach((id) => delete next[id]);
        return next;
      });
    }, HISTORY_REMOVE_DELAY_MS);
    removeTimersRef.current.push(timer);
  }

  useEffect(
    () => () => {
      removeTimersRef.current.forEach(clearTimeout);
    },
    [],
  );

  return (
    <div className="history-page">
      <div className="history-page-header">
        <IconTooltip label={t.sidepanel.backToChat}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.sidepanel.backToChat}
            onClick={onBack}
          >
            <ArrowLeft size={18} />
          </Button>
        </IconTooltip>
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
              aria-label={t.sidepanel.importChatOpenAi}
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
              aria-label={t.sidepanel.clearAllChats}
              onClick={() => rootChats.forEach((chat) => onClose(chat.id))}
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
              removing={!!removingChatIds[chat.id]}
              editingChatId={editingChatId}
              draftTitle={draftTitle}
              agent={agent}
              preferences={preferences}
              onSetDraftTitle={setDraftTitle}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
              onSelect={onSelect}
              onClose={closeWithExit}
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
                    removing={!!removingChatIds[child.id]}
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
                    onClose={closeWithExit}
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
  removing,
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
  removing: boolean;
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
      className={`history-item ${child ? "child" : ""} ${chat.id === activeChatId ? "active" : ""} ${unreadCompletedChatIds[chat.id] ? "unread-complete" : ""} ${removing ? "removing" : ""}`}
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
          disabled={removing}
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
            disabled={removing}
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
            disabled={removing || !chat.messages.length}
            onClick={() => exportChatAsOpenAiJson(chat, agent, preferences)}
          >
            <Download size={13} />
          </Button>
        </IconTooltip>
        <IconTooltip label={t.sidepanel.removeChat}>
          <Button
            variant="ghost"
            size="icon"
            className="history-item-action history-delete-action"
            aria-label={t.sidepanel.removeChat}
            disabled={removing}
            onClick={() => onClose(chat.id)}
          >
            <X size={13} />
          </Button>
        </IconTooltip>
      </div>
    </div>
  );
}

function linkedClosedChatIds(chats: Chat[], closedChatId: string) {
  const ids = new Set([closedChatId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const chat of chats) {
      if (!chat.parentChatId || ids.has(chat.id)) continue;
      if (ids.has(chat.parentChatId)) {
        ids.add(chat.id);
        changed = true;
      }
    }
  }
  return ids;
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

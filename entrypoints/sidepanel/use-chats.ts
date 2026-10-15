import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  chatContent,
  chatMeta,
  chatSummary,
  joinChat,
  sameChatSummary,
  withChatFacts,
} from "../../src/shared/chats";
import { storage } from "../../src/shared/storage";
import type { Chat, ChatSummary } from "../../src/shared/types";
import { useStoredState } from "../../src/ui/useStoredState";
import { prepareChatForList } from "./chat-state-actions";
import {
  createChatContentStore,
  type ChatContentStore,
  type ChatContentEntry,
} from "./chat-content-store";

type PersistMode = "debounced" | "immediate";

export type ChatUpdater = (
  chatId: string,
  update: (chat: Chat) => Chat,
  mode?: PersistMode,
) => void;

export type SummariesUpdater = (
  update: (chats: ChatSummary[]) => ChatSummary[],
) => Promise<unknown>;

// The chat list (summaries only) plus the contents of the chats in use. A
// chat's content loads when it is opened; updates to one chat re-render only
// that chat's subscribers, and the list only when its entries change.
export function useChats() {
  const [summaries, setStoredSummaries] = useStoredState(storage.chats, {
    freshUpdates: true,
  });
  const summariesRef = useRef(summaries);
  summariesRef.current = summaries;
  const setSummariesRef = useRef(setStoredSummaries);
  setSummariesRef.current = setStoredSummaries;
  const setSummaries: SummariesUpdater = useCallback(
    (update) =>
      setSummariesRef.current((items) => {
        const next = update(items);
        return next.length === items.length &&
          next.every((item, index) => sameChatSummary(item, items[index]))
          ? items
          : next;
      }),
    [],
  );
  const [store] = useState(() =>
    createChatContentStore((chatId, facts) =>
      setSummaries((items) =>
        items.map((item) =>
          item.id === chatId ? withChatFacts(item, facts) : item,
        ),
      ).catch((error) => console.warn("Failed to update chat list", error)),
    ),
  );

  useEffect(() => {
    const stop = store.start();
    const flush = () => void store.flushAll();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
      stop();
    };
  }, [store]);

  const summaryOf = (chatId: string) =>
    summariesRef.current?.find((chat) => chat.id === chatId);

  // A loaded chat (summary plus content), without waiting.
  const getChat = useCallback((chatId: string) => {
    const summary = summaryOf(chatId);
    const content = store.content(chatId);
    return summary && content ? joinChat(summary, content) : undefined;
  }, []);

  // A chat with its content, loading the content if needed.
  const loadChat = useCallback(async (chatId: string) => {
    const content = await store.load(chatId);
    const summary = summaryOf(chatId);
    return summary && content ? joinChat(summary, content) : undefined;
  }, []);

  // Update a loaded chat. Metadata changes reach the list at once; content
  // is stored on its own.
  const updateChat: ChatUpdater = useCallback(
    (chatId, update, mode = "debounced") => {
      const content = store.content(chatId);
      if (!content) return;
      // A chat stored a moment ago may not be listed in this render yet; its
      // content updates (stream chunks) still apply.
      const summary = summaryOf(chatId);
      const chat = joinChat(
        summary ?? { id: chatId, title: "", createdAt: 0, updatedAt: 0 },
        content,
      );
      const next = update(chat);
      if (next === chat) return;
      const meta = chatMeta(next);
      if (summary && JSON.stringify(meta) !== JSON.stringify(chatMeta(chat)))
        void setSummaries((items) =>
          items.map((item) =>
            item.id === chatId
              ? {
                  ...meta,
                  messageCount: item.messageCount,
                  running: item.running,
                  attachmentIds: item.attachmentIds,
                }
              : item,
          ),
        );
      store
        .set(chatId, chatContent(next), mode)
        .catch((error) => console.warn("Failed to persist chat", error));
    },
    [setSummaries, store],
  );

  // Add or replace whole chats; `list` adjusts the list around them.
  const saveChats = useCallback(
    async (
      chats: Chat[],
      list: (items: ChatSummary[]) => ChatSummary[] = (items) => items,
    ) => {
      // Content first, so updates to these chats apply as soon as they are
      // listed.
      const stored = chats.map((chat) =>
        store.set(chat.id, chatContent(chat), "immediate"),
      );
      const listed = setSummaries((items) => {
        const kept = list(items);
        const known = new Set(kept.map((item) => item.id));
        const summaries = new Map(
          chats.map((chat) => [chat.id, chatSummary(chat)]),
        );
        return [
          ...kept.map((item) => summaries.get(item.id) ?? item),
          ...chats
            .filter((chat) => !known.has(chat.id))
            .map((chat) => summaries.get(chat.id)!),
        ];
      });
      await Promise.all([...stored, listed]);
    },
    [setSummaries, store],
  );

  // Store a chat that just got a message, tidying the list around it.
  const storeChat = useCallback(
    (chat: Chat) => {
      const stored = prepareChatForList(chat, summariesRef.current || []);
      return saveChats([stored.chat], stored.list);
    },
    [saveChats],
  );

  return {
    summaries,
    summariesRef,
    storeChat,
    setSummaries,
    store,
    getChat,
    loadChat,
    updateChat,
    saveChats,
  };
}

export function useChatEntry(
  store: ChatContentStore,
  chatId: string | undefined,
): ChatContentEntry | undefined {
  const subscribe = useCallback(
    (listener: () => void) =>
      chatId ? store.subscribe(chatId, listener) : () => undefined,
    [chatId, store],
  );
  return useSyncExternalStore(subscribe, () =>
    chatId ? store.get(chatId) : undefined,
  );
}

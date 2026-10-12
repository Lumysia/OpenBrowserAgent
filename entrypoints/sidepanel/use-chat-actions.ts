import { useCallback, type Dispatch, type SetStateAction } from "react";
import { withoutChats } from "../../src/shared/chats";
import type { Messages } from "../../src/shared/i18n";
import { removeChatAttachments } from "../../src/shared/chat-attachments";
import type { Chat, ChatMessage } from "../../src/shared/types";
import {
  closedChatIds,
  createChatDraft,
  forkChatAction,
  pruneEmptyChats,
  selectChatAction,
} from "./chat-state-actions";
import type { useChats } from "./use-chats";

export function useChatActions({
  t,
  chats,
  setDraftChat,
  setActiveChatId,
  setChatSelectionRequestId,
  abortClosedChatStreams,
  clearUnreadCompletedChat,
}: {
  t: Messages;
  chats: ReturnType<typeof useChats>;
  setDraftChat: Dispatch<SetStateAction<Chat | undefined>>;
  setActiveChatId: Dispatch<SetStateAction<string | undefined>>;
  setChatSelectionRequestId: Dispatch<SetStateAction<number>>;
  abortClosedChatStreams: (chatId: string) => Promise<Set<string>>;
  clearUnreadCompletedChat: (chatId: string) => void;
}) {
  const { summaries, summariesRef, setSummaries, store, loadChat, saveChats } =
    chats;

  // A new chat is a draft until its first message is sent.
  const createChat = useCallback(() => {
    const chat = createChatDraft(t.words.newChat);
    setActiveChatId(chat.id);
    setDraftChat(chat);
    return chat;
  }, [setActiveChatId, setDraftChat, t.words.newChat]);

  const closeChat = useCallback(
    async (chatId: string) => {
      const list = summariesRef.current || [];
      // Closing must not depend on the background acknowledging the abort;
      // otherwise the close button silently does nothing.
      const ids = await abortClosedChatStreams(chatId).catch((error) => {
        console.warn("Failed to close chat streams", error);
        return closedChatIds(list, chatId);
      });
      ids.forEach((id) => {
        clearUnreadCompletedChat(id);
      });
      removeChatAttachments(
        list.filter((chat) => ids.has(chat.id)),
        list.filter((chat) => !ids.has(chat.id)),
      ).catch((error) =>
        console.warn("Failed to remove chat attachments", error),
      );
      store.drop(ids);
      void setSummaries((items) => withoutChats(items, ids));
    },
    [
      abortClosedChatStreams,
      clearUnreadCompletedChat,
      setSummaries,
      store,
      summariesRef,
    ],
  );

  const selectChat = useCallback(
    (chatId: string) => {
      if (summaries && !summaries.some((chat) => chat.id === chatId)) return;
      selectChatAction({ chatId, setSummaries, setActiveChatId });
      setChatSelectionRequestId((value) => value + 1);
    },
    [summaries, setActiveChatId, setChatSelectionRequestId, setSummaries],
  );

  const importChat = useCallback(
    (chat: Chat) => {
      void saveChats([chat], pruneEmptyChats);
      setActiveChatId(chat.id);
    },
    [saveChats, setActiveChatId],
  );

  const forkMessage = useCallback(
    (chat: Chat | undefined, message: ChatMessage, partId?: string) => {
      if (!chat) return;
      forkChatAction({
        chat,
        message,
        partId,
        forkLabel: t.sidepanel.forkTitleSuffix,
        chats: summariesRef.current || [],
        loadChat,
        saveChats: (items) => saveChats(items),
        setActiveChatId,
      }).catch((error) => console.warn("Failed to fork chat", error));
    },
    [loadChat, saveChats, setActiveChatId, summariesRef, t.sidepanel],
  );

  return { createChat, closeChat, selectChat, importChat, forkMessage };
}

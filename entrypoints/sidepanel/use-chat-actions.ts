import { useCallback, type Dispatch } from "react";
import { withoutChats } from "../../src/shared/chats";
import { useMessages } from "../../src/ui/messages";
import { removeChatAttachments } from "../../src/shared/chat-attachments";
import type { Chat, ChatMessage } from "../../src/shared/types";
import {
  closedChatIds,
  createChatDraft,
  forkChatAction,
  pruneEmptyChats,
} from "./chat-state-actions";
import type { ChatSelectionAction } from "./chat-selection";
import type { useChats } from "./use-chats";

export function useChatActions({
  chats,
  dispatchSelection,
  abortClosedChatStreams,
  clearUnreadCompletedChat,
}: {
  chats: ReturnType<typeof useChats>;
  dispatchSelection: Dispatch<ChatSelectionAction>;
  abortClosedChatStreams: (chatId: string) => Promise<Set<string>>;
  clearUnreadCompletedChat: (chatId: string) => void;
}) {
  const t = useMessages();
  const { summaries, summariesRef, setSummaries, store, loadChat, saveChats } =
    chats;

  // A new chat is a draft until its first message is sent.
  const createChat = useCallback(() => {
    const chat = createChatDraft(t.words.newChat);
    dispatchSelection({ type: "create", chat });
    return chat;
  }, [dispatchSelection, t.words.newChat]);

  const openChat = useCallback(
    (chatId: string) => dispatchSelection({ type: "open", chatId }),
    [dispatchSelection],
  );

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
      void setSummaries(pruneEmptyChats);
      dispatchSelection({ type: "open", chatId, request: true });
    },
    [summaries, dispatchSelection, setSummaries],
  );

  const importChat = useCallback(
    (chat: Chat) => {
      void saveChats([chat], pruneEmptyChats);
      openChat(chat.id);
    },
    [saveChats, openChat],
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
        openChat,
      }).catch((error) => console.warn("Failed to fork chat", error));
    },
    [loadChat, saveChats, openChat, summariesRef, t.sidepanel],
  );

  return { createChat, closeChat, selectChat, importChat, forkMessage };
}

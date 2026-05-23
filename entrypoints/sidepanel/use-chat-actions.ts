import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Messages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import { removeSyncedChatAttachments } from "../../src/shared/sync-chat-attachments";
import type { Chat, Preferences } from "../../src/shared/types";
import {
  closedChatIds,
  closeChatAction,
  createChatAction,
  selectChatAction,
} from "./chat-state-actions";

export function useChatActions({
  t,
  activeChatId,
  setChats,
  setActiveChatId,
  setChatSelectionRequestId,
  abortChatStream,
  clearUnreadCompletedChat,
  preferences,
}: {
  t: Messages;
  activeChatId?: string;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setActiveChatId: Dispatch<SetStateAction<string | undefined>>;
  setChatSelectionRequestId: Dispatch<SetStateAction<number>>;
  abortChatStream: (chatId: string) => void;
  clearUnreadCompletedChat: (chatId: string) => void;
  preferences?: Preferences;
}) {
  const createChat = useCallback(
    () =>
      createChatAction({
        title: t.words.newChat,
        persist: false,
        setChats,
        setActiveChatId,
      }),
    [setActiveChatId, setChats, t.words.newChat],
  );

  const closeChat = useCallback(
    (chatId: string) => {
      abortChatStream(chatId);
      storage.chats
        .get()
        .then((chats) => {
          const ids = closedChatIds(chats, chatId);
          return removeSyncedChatAttachments(
            preferences,
            chats.filter((chat) => ids.has(chat.id)),
          );
        })
        .catch((error) =>
          console.warn("Failed to remove synced chat attachments", error),
        );
      closeChatAction({
        chatId,
        activeChatId,
        setChats,
        setActiveChatId,
      });
      clearUnreadCompletedChat(chatId);
    },
    [
      abortChatStream,
      activeChatId,
      clearUnreadCompletedChat,
      preferences,
      setActiveChatId,
      setChats,
    ],
  );

  const selectChat = useCallback(
    (chatId: string) => {
      selectChatAction({ chatId, setChats, setActiveChatId });
      setChatSelectionRequestId((value) => value + 1);
    },
    [setActiveChatId, setChatSelectionRequestId, setChats],
  );

  return { createChat, closeChat, selectChat };
}

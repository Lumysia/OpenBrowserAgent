import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Messages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import { removeSyncedChatAttachments } from "../../src/shared/sync-chat-attachments";
import type { SyncDataSettings } from "../../src/shared/sync-data-settings";
import type { Chat } from "../../src/shared/types";
import {
  closeChatAction,
  createChatAction,
  selectChatAction,
} from "./chat-state-actions";

export function useChatActions({
  t,
  chats,
  setChats,
  setDraftChat,
  setActiveChatId,
  setChatSelectionRequestId,
  abortClosedChatStreams,
  clearUnreadCompletedChat,
  syncDataSettings,
}: {
  t: Messages;
  chats?: Chat[];
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setDraftChat: Dispatch<SetStateAction<Chat | undefined>>;
  setActiveChatId: Dispatch<SetStateAction<string | undefined>>;
  setChatSelectionRequestId: Dispatch<SetStateAction<number>>;
  abortClosedChatStreams: (chatId: string) => Promise<Set<string>>;
  clearUnreadCompletedChat: (chatId: string) => void;
  syncDataSettings?: SyncDataSettings;
}) {
  const createChat = useCallback(() => {
    const chat = createChatAction({
      title: t.words.newChat,
      persist: false,
      setChats,
      setActiveChatId,
    });
    setDraftChat(chat);
    return chat;
  }, [setActiveChatId, setChats, setDraftChat, t.words.newChat]);

  const closeChat = useCallback(
    async (chatId: string) => {
      let ids: Set<string>;
      try {
        ids = await abortClosedChatStreams(chatId);
      } catch (error) {
        console.warn("Failed to close chat streams", error);
        return;
      }
      ids.forEach((id) => {
        clearUnreadCompletedChat(id);
      });
      storage.chats
        .get()
        .then((storedChats) => {
          const removedChats = storedChats.filter((chat) => ids.has(chat.id));
          const retainedChats = storedChats.filter((chat) => !ids.has(chat.id));
          return removeSyncedChatAttachments(
            syncDataSettings,
            removedChats,
            retainedChats,
          );
        })
        .catch((error) =>
          console.warn("Failed to remove synced chat attachments", error),
        );
      closeChatAction({
        closedIds: ids,
        setChats,
      });
    },
    [
      abortClosedChatStreams,
      clearUnreadCompletedChat,
      syncDataSettings,
      setChats,
    ],
  );

  const selectChat = useCallback(
    (chatId: string) => {
      if (chats && !chats.some((chat) => chat.id === chatId)) return;
      selectChatAction({ chatId, setChats, setActiveChatId });
      setChatSelectionRequestId((value) => value + 1);
    },
    [chats, setActiveChatId, setChatSelectionRequestId, setChats],
  );

  return { createChat, closeChat, selectChat };
}

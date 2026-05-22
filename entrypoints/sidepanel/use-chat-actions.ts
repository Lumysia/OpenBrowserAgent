import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Messages } from "../../src/shared/i18n";
import type { Chat } from "../../src/shared/types";
import {
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
}: {
  t: Messages;
  activeChatId?: string;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setActiveChatId: Dispatch<SetStateAction<string | undefined>>;
  setChatSelectionRequestId: Dispatch<SetStateAction<number>>;
  abortChatStream: (chatId: string) => void;
  clearUnreadCompletedChat: (chatId: string) => void;
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

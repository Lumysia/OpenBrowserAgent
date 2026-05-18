import { useEffect } from "react";
import type { RefObject } from "react";
import type { Chat } from "../../src/shared/types";
import { sortChatsNewestFirst } from "./format";

export function useSidepanelTheme(
  accentColor: string | undefined,
  colorScheme: string | undefined,
) {
  useEffect(() => {
    document.documentElement.dataset.accent = accentColor || "pink";
    document.documentElement.dataset.theme = colorScheme || "system";
  }, [accentColor, colorScheme]);
}

export function useAutoScroll(
  messagesRef: RefObject<HTMLDivElement | null>,
  messages: Chat["messages"] | undefined,
  autoScroll: boolean | undefined,
  streaming: boolean,
) {
  useEffect(() => {
    if (autoScroll === false) return;
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;
    requestAnimationFrame(() => {
      messagesElement.scrollTo({
        top: messagesElement.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [messages, autoScroll, streaming]);
}

export function useChatSelection(
  chats: Chat[] | undefined,
  activeChatId: string | undefined,
  initializedChatSelectionRef: RefObject<boolean>,
  setActiveChatId: (chatId: string | undefined) => void,
  createChat: () => Chat,
) {
  useEffect(() => {
    if (!chats) return;
    if (!chats.length) {
      createChat();
      return;
    }
    if (!initializedChatSelectionRef.current) {
      initializedChatSelectionRef.current = true;
      const emptyChat = [...chats]
        .reverse()
        .find((chat) => !chat.messages.length);
      if (emptyChat) setActiveChatId(emptyChat.id);
      else createChat();
      return;
    }
    if (!activeChatId || !chats.some((chat) => chat.id === activeChatId))
      setActiveChatId(sortChatsNewestFirst(chats)[0]?.id);
  }, [
    activeChatId,
    chats,
    createChat,
    initializedChatSelectionRef,
    setActiveChatId,
  ]);
}

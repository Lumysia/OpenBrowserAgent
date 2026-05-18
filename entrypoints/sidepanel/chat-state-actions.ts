import type { Dispatch, SetStateAction } from "react";
import type { Chat } from "../../src/shared/types";
import { sortChatsNewestFirst } from "./format";

type ChatSetter = Dispatch<SetStateAction<Chat[]>>;
type ActiveChatSetter = Dispatch<SetStateAction<string | undefined>>;

export function createChatAction({
  title,
  setChats,
  setActiveChatId,
}: {
  title: string;
  setChats: ChatSetter;
  setActiveChatId: ActiveChatSetter;
}) {
  const now = Date.now();
  const chat: Chat = {
    id: crypto.randomUUID(),
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  setChats((items) => [...items, chat]);
  setActiveChatId(chat.id);
  return chat;
}

export function updateChatAction(setChats: ChatSetter, chat: Chat) {
  setChats((items) =>
    items.map((candidate) => (candidate.id === chat.id ? chat : candidate)),
  );
}

export function closeChatAction({
  chatId,
  activeChatId,
  setChats,
  setActiveChatId,
}: {
  chatId: string;
  activeChatId?: string;
  setChats: ChatSetter;
  setActiveChatId: ActiveChatSetter;
}) {
  setChats((items) => {
    const next = items.filter((chat) => chat.id !== chatId);
    if (activeChatId === chatId)
      setActiveChatId(sortChatsNewestFirst(next)[0]?.id);
    return next;
  });
}

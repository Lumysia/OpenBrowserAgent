import type { Dispatch, SetStateAction } from "react";
import type { Chat, ChatMessage } from "../../src/shared/types";
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

export function forkChatAction({
  chat,
  message,
  setChats,
  setActiveChatId,
}: {
  chat: Chat;
  message: ChatMessage;
  setChats: ChatSetter;
  setActiveChatId: ActiveChatSetter;
}) {
  const messageIndex = chat.messages.findIndex(
    (item) => item.id === message.id,
  );
  if (messageIndex < 0) return;
  const now = Date.now();
  const fork: Chat = {
    ...chat,
    id: crypto.randomUUID(),
    messages: chat.messages.slice(0, messageIndex + 1),
    createdAt: now,
    updatedAt: now,
  };
  setChats((items) => [...items, fork]);
  setActiveChatId(fork.id);
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

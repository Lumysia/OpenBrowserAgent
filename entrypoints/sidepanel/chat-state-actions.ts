import type { Dispatch, SetStateAction } from "react";
import type { Chat, ChatMessage } from "../../src/shared/types";
import { sortChatsNewestFirst } from "./format";

type ChatSetter = Dispatch<SetStateAction<Chat[]>>;
type ActiveChatSetter = Dispatch<SetStateAction<string | undefined>>;

export function createChatAction({
  title,
  persist = true,
  setChats,
  setActiveChatId,
}: {
  title: string;
  persist?: boolean;
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
  if (persist) setChats((items) => [...pruneEmptyChats(items), chat]);
  setActiveChatId(chat.id);
  return chat;
}

export function selectChatAction({
  chatId,
  setChats,
  setActiveChatId,
}: {
  chatId: string;
  setChats: ChatSetter;
  setActiveChatId: ActiveChatSetter;
}) {
  setChats((items) =>
    items.filter((chat) => chat.id === chatId || !isEmptyChat(chat)),
  );
  setActiveChatId(chatId);
}

export function pruneEmptyChats(chats: Chat[]) {
  return chats.filter((chat) => !isEmptyChat(chat));
}

export function updateChatAction(setChats: ChatSetter, chat: Chat) {
  setChats((items) => {
    const pruned = pruneEmptyChats(items);
    if (!pruned.some((candidate) => candidate.id === chat.id))
      return [...pruned, chat];
    return pruned.map((candidate) =>
      candidate.id === chat.id ? chat : candidate,
    );
  });
}

function isEmptyChat(chat: Chat) {
  return chat.messages.length === 0;
}

export function forkChatAction({
  chat,
  message,
  partId,
  setChats,
  setActiveChatId,
}: {
  chat: Chat;
  message: ChatMessage;
  partId?: string;
  setChats: ChatSetter;
  setActiveChatId: ActiveChatSetter;
}) {
  const messageIndex = chat.messages.findIndex(
    (item) => item.id === message.id,
  );
  if (messageIndex < 0) return;
  const now = Date.now();
  const forkedMessage = partId
    ? truncateMessageAtPart(message, partId)
    : message;
  const fork: Chat = {
    ...chat,
    id: crypto.randomUUID(),
    messages: [...chat.messages.slice(0, messageIndex), forkedMessage],
    createdAt: now,
    updatedAt: now,
  };
  setChats((items) => [...items, fork]);
  setActiveChatId(fork.id);
}

function truncateMessageAtPart(message: ChatMessage, partId: string) {
  const partIndex =
    message.parts?.findIndex((part) => part.id === partId) ?? -1;
  if (!message.parts || partIndex < 0) return message;
  const parts = message.parts.slice(0, partIndex + 1);
  const content = parts
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("");
  return { ...message, content, parts };
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

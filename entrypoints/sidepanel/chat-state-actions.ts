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
  agentId,
}: {
  title: string;
  persist?: boolean;
  agentId?: string;
  setChats: ChatSetter;
  setActiveChatId: ActiveChatSetter;
}) {
  const now = Date.now();
  const chat: Chat = {
    id: crypto.randomUUID(),
    title,
    agentId,
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
    const nextChat = pruneStaleChildLinks(chat, pruned);
    const nextItems = detachStaleChildren(pruned, nextChat);
    if (!nextItems.some((candidate) => candidate.id === nextChat.id))
      return [...nextItems, nextChat];
    return nextItems.map((candidate) =>
      candidate.id === nextChat.id ? nextChat : candidate,
    );
  });
}

function isEmptyChat(chat: Chat) {
  return chat.messages.length === 0;
}

function pruneStaleChildLinks(chat: Chat, chats: Chat[]) {
  const linkedChildIds = retainedChildChatIds(chat, chats);
  if (
    !chat.childChatIds?.length ||
    linkedChildIds.size === chat.childChatIds.length
  )
    return chat;
  return {
    ...chat,
    childChatIds: chat.childChatIds.filter((id) => linkedChildIds.has(id)),
  };
}

function detachStaleChildren(chats: Chat[], parent: Chat) {
  const linkedChildIds = new Set(parent.childChatIds || []);
  return chats.map((chat) =>
    chat.parentChatId === parent.id && !linkedChildIds.has(chat.id)
      ? {
          ...chat,
          kind: "normal" as const,
          parentChatId: undefined,
          parentMessageId: undefined,
          parentToolCallId: undefined,
        }
      : chat,
  );
}

function retainedChildChatIds(parent: Chat, chats: Chat[]) {
  const messageIds = new Set(parent.messages.map((message) => message.id));
  const toolCallIds = new Set<string>();
  const outputChildIds = new Set<string>();
  for (const message of parent.messages) {
    for (const part of message.parts || []) {
      if (part.id) toolCallIds.add(part.id);
      const output = part.output as Record<string, unknown> | undefined;
      const childChatId = String(
        output?.childChatId || output?.taskId || "",
      ).trim();
      if (childChatId) outputChildIds.add(childChatId);
    }
  }
  return new Set(
    chats
      .filter(
        (chat) =>
          chat.parentChatId === parent.id &&
          (outputChildIds.has(chat.id) ||
            (chat.parentToolCallId && toolCallIds.has(chat.parentToolCallId)) ||
            (chat.parentMessageId && messageIds.has(chat.parentMessageId))),
      )
      .map((chat) => chat.id),
  );
}

export function forkChatAction({
  chat,
  message,
  partId,
  forkLabel,
  setChats,
  setActiveChatId,
}: {
  chat: Chat;
  message: ChatMessage;
  partId?: string;
  forkLabel: string;
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
    title: forkTitle(chat.title, forkLabel, now),
    kind: "normal",
    parentChatId: undefined,
    parentMessageId: undefined,
    parentToolCallId: undefined,
    childChatIds: undefined,
    messages: [...chat.messages.slice(0, messageIndex), forkedMessage],
    createdAt: now,
    updatedAt: now,
  };
  setChats((items) => [...items, fork]);
  setActiveChatId(fork.id);
}

function forkTitle(title: string, forkLabel: string, now: number) {
  const time = new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
  return `${title} · ${forkLabel} ${time}`;
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
    const next = cleanupClosedChatRelationships(
      items.filter((chat) => chat.id !== chatId),
      chatId,
    );
    if (activeChatId === chatId)
      setActiveChatId(sortChatsNewestFirst(next)[0]?.id);
    return next;
  });
}

function cleanupClosedChatRelationships(chats: Chat[], closedChatId: string) {
  return chats.map((chat) => {
    const detached =
      chat.parentChatId === closedChatId
        ? {
            ...chat,
            kind: "normal" as const,
            parentChatId: undefined,
            parentMessageId: undefined,
            parentToolCallId: undefined,
          }
        : chat;
    if (!detached.childChatIds?.includes(closedChatId)) return detached;
    return {
      ...detached,
      childChatIds: detached.childChatIds.filter((id) => id !== closedChatId),
    };
  });
}

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
    const nextItems = removeStaleChildren(pruned, nextChat);
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

function removeStaleChildren(chats: Chat[], parent: Chat) {
  const linkedChildIds = new Set(parent.childChatIds || []);
  return chats.filter(
    (chat) => chat.parentChatId !== parent.id || linkedChildIds.has(chat.id),
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
  const forkId = crypto.randomUUID();
  const forkedMessage = partId
    ? truncateMessageAtPart(message, partId)
    : message;
  const messages = [...chat.messages.slice(0, messageIndex), forkedMessage];
  setChats((items) => {
    const linked = forkLinkedChildren({
      chats: items,
      messages,
      originalParentId: chat.id,
      forkParentId: forkId,
      now,
    });
    const fork: Chat = {
      ...chat,
      id: forkId,
      title: forkTitle(chat.title, forkLabel, now),
      kind: "normal",
      parentChatId: undefined,
      parentMessageId: undefined,
      parentToolCallId: undefined,
      childChatIds: linked.children.length
        ? linked.children.map((child) => child.id)
        : undefined,
      messages: linked.messages,
      createdAt: now,
      updatedAt: now,
    };
    return [...items, fork, ...linked.children];
  });
  setActiveChatId(forkId);
}

function forkLinkedChildren({
  chats,
  messages,
  originalParentId,
  forkParentId,
  now,
}: {
  chats: Chat[];
  messages: ChatMessage[];
  originalParentId: string;
  forkParentId: string;
  now: number;
}): { messages: ChatMessage[]; children: Chat[] } {
  const childIdMap = new Map<string, string>();
  const nextMessages = messages.map((message) => ({
    ...message,
    parts: message.parts?.map((part) => {
      const output = part.output as Record<string, unknown> | undefined;
      const childChatId = String(
        output?.childChatId || output?.taskId || "",
      ).trim();
      if (!childChatId || !chats.some((chat) => chat.id === childChatId))
        return part;
      const nextChildId = childIdMap.get(childChatId) || crypto.randomUUID();
      childIdMap.set(childChatId, nextChildId);
      return {
        ...part,
        output: {
          ...output,
          childChatId: nextChildId,
          taskId: nextChildId,
          parentChatId: forkParentId,
        },
      };
    }),
  }));
  const children: Chat[] = [];
  for (const [oldId, nextId] of childIdMap.entries()) {
    const child = chats.find((chat) => chat.id === oldId);
    if (child)
      children.push({
        ...child,
        id: nextId,
        parentChatId: forkParentId,
        messages: child.messages.map((message) => ({
          ...message,
          metadata: relinkChildMetadata(
            message.metadata,
            originalParentId,
            forkParentId,
          ),
        })),
        createdAt: now,
        updatedAt: now,
      });
  }
  return { messages: nextMessages, children };
}

function relinkChildMetadata(
  metadata: Record<string, unknown> | undefined,
  originalParentId: string,
  forkParentId: string,
) {
  if (metadata?.parentChatId !== originalParentId) return metadata;
  return { ...metadata, parentChatId: forkParentId };
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
    const closedIds = closedChatIds(items, chatId);
    const next = cleanupClosedChatRelationships(
      items.filter((chat) => !closedIds.has(chat.id)),
      closedIds,
    );
    if (activeChatId === chatId)
      setActiveChatId(sortChatsNewestFirst(next)[0]?.id);
    return next;
  });
}

export function closedChatIds(chats: Chat[], closedChatId: string) {
  const ids = new Set([closedChatId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const chat of chats) {
      if (!chat.parentChatId || ids.has(chat.id)) continue;
      if (ids.has(chat.parentChatId)) {
        ids.add(chat.id);
        changed = true;
      }
    }
  }
  return ids;
}

function cleanupClosedChatRelationships(
  chats: Chat[],
  closedChatIds: Set<string>,
) {
  return chats.map((chat) => {
    if (!chat.childChatIds?.some((id) => closedChatIds.has(id))) return chat;
    return {
      ...chat,
      childChatIds: chat.childChatIds.filter((id) => !closedChatIds.has(id)),
    };
  });
}

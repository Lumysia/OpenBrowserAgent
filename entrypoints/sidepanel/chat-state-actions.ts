import { formatDateTime } from "../../src/shared/format";
import { languageOf, type Messages } from "../../src/shared/i18n";
import type { Chat, ChatMessage, ChatSummary } from "../../src/shared/types";

export function createChatDraft(title: string, agentId?: string): Chat {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title,
    agentId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function pruneEmptyChats(chats: ChatSummary[]) {
  return chats.some(isEmptyChat)
    ? chats.filter((chat) => !isEmptyChat(chat))
    : chats;
}

// A chat about to be stored, and how the list changes around it: empty chats
// and sub-agent chats the chat no longer links to leave.
export function prepareChatForList(chat: Chat, chats: ChatSummary[]) {
  const nextChat = pruneStaleChildLinks(chat, chats);
  return {
    chat: nextChat,
    list: (items: ChatSummary[]) =>
      removeStaleChildren(pruneEmptyChats(items), nextChat),
  };
}

function isEmptyChat(chat: ChatSummary) {
  return chat.messageCount === 0;
}

function pruneStaleChildLinks(chat: Chat, chats: ChatSummary[]) {
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

function removeStaleChildren(chats: ChatSummary[], parent: Chat) {
  const linkedChildIds = new Set(parent.childChatIds || []);
  return chats.filter(
    (chat) => chat.parentChatId !== parent.id || linkedChildIds.has(chat.id),
  );
}

function retainedChildChatIds(parent: Chat, chats: ChatSummary[]) {
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

export async function forkChatAction({
  chat,
  message,
  partId,
  t,
  chats,
  loadChat,
  saveChats,
  openChat,
}: {
  chat: Chat;
  message: ChatMessage;
  partId?: string;
  t: Messages;
  chats: ChatSummary[];
  loadChat: (chatId: string) => Promise<Chat | undefined>;
  saveChats: (chats: Chat[]) => Promise<void>;
  openChat: (chatId: string) => void;
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
  const linked = await forkLinkedChildren({
    chats,
    loadChat,
    messages,
    originalParentId: chat.id,
    forkParentId: forkId,
    now,
  });
  const fork: Chat = {
    ...chat,
    id: forkId,
    title: forkTitle(chat.title, t, now),
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
  await saveChats([fork, ...linked.children]);
  openChat(forkId);
}

// Sub-agent chats the forked messages link to are copied along (their
// content is loaded for that).
async function forkLinkedChildren({
  chats,
  loadChat,
  messages,
  originalParentId,
  forkParentId,
  now,
}: {
  chats: ChatSummary[];
  loadChat: (chatId: string) => Promise<Chat | undefined>;
  messages: ChatMessage[];
  originalParentId: string;
  forkParentId: string;
  now: number;
}): Promise<{ messages: ChatMessage[]; children: Chat[] }> {
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
    const child = await loadChat(oldId);
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

function forkTitle(title: string, t: Messages, now: number) {
  const time = formatDateTime(languageOf(t), now, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${title} · ${t.sidepanel.forkTitleSuffix} ${time}`;
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

export function closedChatIds(chats: ChatSummary[], closedChatId: string) {
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

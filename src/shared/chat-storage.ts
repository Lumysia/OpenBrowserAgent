import {
  chatFacts,
  joinChat,
  normalizeChatContent,
  withoutChats,
} from "./chats";
import { storage, STORAGE_KEYS } from "./storage";
import { queueSyncWrite } from "./storage-sync";
import {
  isSplitSyncRouted,
  loadSplitItem,
  markSplitItemsPending,
  readSplitItem,
  refreshSplitItem,
  setSplitItem,
  splitItemKey,
  SplitItemUnavailableError,
} from "./storage-split";
import { getActiveSyncBackend } from "./sync-backends";
import {
  chatAttachmentIds,
  offloadChatInlineAttachments,
} from "./sync-chat-attachments";
import type { Chat, ChatContent } from "./types";

// Chats are stored as a list of summaries (storage.chats) plus one content
// entry per chat, loaded only when that chat is needed.

const CHATS = STORAGE_KEYS.chats;

export function chatContentKey(chatId: string) {
  return splitItemKey(CHATS, chatId);
}

// This device's copy, without contacting the cloud.
export async function readLocalChatContent(chatId: string) {
  const content = await readSplitItem<ChatContent>(CHATS, chatId);
  return content === undefined ? undefined : normalizeChatContent(content);
}

// Up to date with the cloud when chats sync; throws when the content is
// neither on this device nor reachable.
export async function loadChatContent(chatId: string) {
  const content = await loadSplitItem<ChatContent>(CHATS, chatId);
  if (content !== undefined) return normalizeChatContent(content);
  // Listed with messages, but its content is on neither this device nor the
  // cloud (e.g. sync was turned off while the cloud was unreachable).
  const summary = (await storage.chats.get()).find(
    (chat) => chat.id === chatId,
  );
  if (summary?.messageCount)
    throw new SplitItemUnavailableError(
      `Content of chat ${chatId} is not available.`,
    );
  return undefined;
}

// Check this device's copy against the cloud; a newer one is stored.
export function refreshChatContent(chatId: string) {
  return refreshSplitItem(CHATS, chatId);
}

export async function readChat(chatId: string): Promise<Chat | undefined> {
  const summary = (await storage.chats.get()).find(
    (chat) => chat.id === chatId,
  );
  if (!summary) return undefined;
  return joinChat(summary, (await loadChatContent(chatId)) ?? { messages: [] });
}

// Store one chat's content. Returns what was stored and the list facts that
// describe it.
export async function saveChatContent(chatId: string, value: ChatContent) {
  const content = await offloadChatInlineAttachments(chatId, value);
  await setSplitItem(CHATS, chatId, content);
  if (await isSplitSyncRouted(CHATS)) {
    await markSplitItemsPending(CHATS, [chatId]);
    queueSyncWrite(await getActiveSyncBackend(), CHATS);
  }
  return { content, facts: contentFacts(content) };
}

// The list facts that describe a chat's content.
export function contentFacts(content: ChatContent) {
  return chatFacts(content, [...chatAttachmentIds(content)].sort());
}

// Removing a chat from the list also removes its content.
export async function deleteChats(chatIds: Iterable<string>) {
  const ids = new Set(chatIds);
  await storage.chats.update((chats) => withoutChats(chats, ids));
}

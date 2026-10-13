import {
  chatAttachmentIds,
  offloadChatInlineAttachments,
} from "./chat-attachments";
import { chatContentKey } from "./chat-keys";
import {
  chatContent,
  chatFacts,
  joinChat,
  normalizeChatContent,
  withoutChats,
} from "./chats";
import { storageLockName, withLock } from "./locks";
import { getBrowserApi, storage } from "./storage";
import { keepStoredForm } from "./stored-form";
import { loadSyncedContent } from "./sync/client";
import { sameJson } from "./sync/codec";
import { mergeChatBodies } from "./sync/merge-content";
import type { Chat, ChatContent } from "./types";

export { chatContentKey };

// Chats are stored as a list of summaries (storage.chats) plus one content
// entry per chat, loaded only when that chat is needed. Content synced from
// another device is downloaded the first time the chat is opened here.

export class ChatContentUnavailableError extends Error {}

const local = () => getBrowserApi().storage.local;

// This device's copy, without contacting the cloud.
export async function readLocalChatContent(chatId: string) {
  const key = chatContentKey(chatId);
  const content = (await local().get(key))[key];
  return content === undefined ? undefined : normalizeChatContent(content);
}

// This device's copy, else the synced copy downloaded now. Throws when a
// chat with messages has content on neither (sync off, cloud unreachable).
export async function loadChatContent(chatId: string) {
  const content = await readLocalChatContent(chatId);
  if (content !== undefined) return content;
  const summary = (await storage.chats.get()).find(
    (chat) => chat.id === chatId,
  );
  if (!summary?.messageCount) return undefined;
  if (await loadSyncedContent("chats", chatId).catch(() => false)) {
    const loaded = await readLocalChatContent(chatId);
    if (loaded !== undefined) return loaded;
  }
  throw new ChatContentUnavailableError(
    `Content of chat ${chatId} is not available.`,
  );
}

export async function readChat(chatId: string): Promise<Chat | undefined> {
  const summary = (await storage.chats.get()).find(
    (chat) => chat.id === chatId,
  );
  if (!summary) return undefined;
  return joinChat(summary, (await loadChatContent(chatId)) ?? { messages: [] });
}

// Store one chat's content. Returns the content as reading it back gives it
// (the form pages work with, so it can be the next save's `base`) and the
// list facts that describe it. `base`: the content the value was made from;
// content stored since (a sync download the page has not merged) is merged
// in, so a page's copy never undoes it.
export async function saveChatContent(
  chatId: string,
  value: ChatContent,
  base?: ChatContent,
) {
  let content = await offloadChatInlineAttachments(chatId, value);
  const key = chatContentKey(chatId);
  await withLock(storageLockName(key), async () => {
    const raw = (await local().get(key))[key];
    const stored = raw === undefined ? undefined : normalizeChatContent(raw);
    const from = base && normalizeChatContent(base);
    if (from && stored && !sameJson(stored, from))
      content = chatContent(
        mergeChatBodies(from, content, stored, "mine") as ChatContent,
      );
    // Messages this save left alone stay as stored, whatever loading them
    // normalized.
    const write = keepStoredForm(raw, stored ?? content, content);
    content = normalizeChatContent(write);
    if (raw !== undefined && sameJson(write, raw)) return;
    await local().set({ [key]: write });
  });
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

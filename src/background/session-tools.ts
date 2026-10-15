import { clampInt, trimmedString } from "../shared/values";
import {
  deleteChats,
  readChat,
  readLocalChatContent,
} from "../shared/chat-storage";
import { storage } from "../shared/storage";
import type { ChatContent, ChatMessage, ChatSummary } from "../shared/types";

const CHAT_SEARCH_LIMIT = 12;
const CHAT_READ_MESSAGE_LIMIT = 80;
const CHAT_CONTENT_PREVIEW_CHARS = 280;
const CHAT_READ_CONTENT_CHARS = 4000;

type Input = Record<string, unknown>;

const ACTIONS: Record<string, (input: Input) => Promise<object>> = {
  search: searchChatHistory,
  read: readChatThread,
  delete: deleteChatThread,
};
export const CHAT_HISTORY_ACTIONS = Object.keys(ACTIONS);

export async function chatHistory(input: Input): Promise<object> {
  const action = trimmedString(input.action) || "search";
  return (
    ACTIONS[action]?.(input) ?? { error: "Unknown chat history action", action }
  );
}

async function searchChatHistory(input: Input) {
  const query = String(input.query || "")
    .trim()
    .toLowerCase();
  const offset = clampInt(input.offset, { fallback: 0, min: 0 });
  const limit = clampInt(input.limit, {
    fallback: CHAT_SEARCH_LIMIT,
    min: 1,
    max: 30,
  });
  // Titles of every chat; messages only of chats whose content is on this
  // device, so a search never downloads every synced chat.
  const chats = await Promise.all(
    (await storage.chats.get()).map(async (chat) => ({
      chat,
      content: await readLocalChatContent(chat.id),
    })),
  );
  const allMatches = chats
    .map(({ chat, content }) => ({
      chat,
      content,
      score: chatSearchScore(chat, content, query),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || right.chat.updatedAt - left.chat.updatedAt,
    );
  const results = allMatches
    .slice(offset, offset + limit)
    .map(({ chat, content }) => ({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: chat.messageCount,
      preview: content ? chatPreview(content) : "",
    }));
  return {
    query,
    offset,
    limit,
    totalCount: allMatches.length,
    returnedCount: results.length,
    truncated: offset + limit < allMatches.length,
    results,
  };
}

async function readChatThread(input: Input) {
  const chatId = String(input.chatId || input.id || "").trim();
  if (!chatId) return { error: "Missing chatId" };
  const requestedOffset = input.offset;
  const limit = clampInt(input.limit, {
    fallback: CHAT_READ_MESSAGE_LIMIT,
    min: 1,
    max: 200,
  });
  const chat = await readChat(chatId);
  if (!chat) return { error: "Chat thread not found", chatId };
  const offset =
    requestedOffset === undefined
      ? Math.max(0, chat.messages.length - limit)
      : clampInt(requestedOffset, { fallback: 0, min: 0 });
  const messages = chat.messages
    .slice(offset, offset + limit)
    .map(readableMessage);
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messageCount: chat.messages.length,
    offset,
    limit,
    returnedMessages: messages.length,
    truncated: offset + limit < chat.messages.length,
    messages,
  };
}

async function deleteChatThread(input: Input) {
  const chatId = String(input.chatId || input.id || "").trim();
  if (!chatId) return { error: "Missing chatId" };
  const chat = (await storage.chats.get()).find((item) => item.id === chatId);
  if (!chat) return { error: "Chat thread not found", chatId };
  await deleteChats([chatId]);
  return { id: chat.id, title: chat.title, deleted: true };
}

function chatSearchScore(
  chat: ChatSummary,
  content: ChatContent | undefined,
  query: string,
) {
  if (!query) return chat.updatedAt || 1;
  const titleScore = chat.title.toLowerCase().includes(query) ? 100 : 0;
  const messageScore = (content?.messages || []).reduce(
    (score, message) =>
      score + (messageText(message).toLowerCase().includes(query) ? 1 : 0),
    0,
  );
  return titleScore + messageScore;
}

function chatPreview(chat: ChatContent) {
  const message = [...chat.messages]
    .reverse()
    .find((item) => messageText(item).trim());
  return message
    ? truncate(messageText(message), CHAT_CONTENT_PREVIEW_CHARS)
    : "";
}

function readableMessage(message: ChatMessage) {
  const content = messageText(message);
  return {
    id: message.id,
    role: message.role,
    createdAt: message.createdAt,
    content: truncate(content, CHAT_READ_CONTENT_CHARS),
    truncated: content.length > CHAT_READ_CONTENT_CHARS,
  };
}

function messageText(message: ChatMessage) {
  if (message.content) return message.content;
  return (message.parts || [])
    .map((part) => part.text || "")
    .filter(Boolean)
    .join("\n");
}

function truncate(text: string, limit: number) {
  return text.length <= limit ? text : `${text.slice(0, limit)}\n[truncated]`;
}

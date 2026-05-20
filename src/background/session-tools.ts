import { storage } from "../shared/storage";
import type { Chat, ChatMessage } from "../shared/types";

const CHAT_SEARCH_LIMIT = 12;
const CHAT_READ_MESSAGE_LIMIT = 80;
const CHAT_CONTENT_PREVIEW_CHARS = 280;
const CHAT_READ_CONTENT_CHARS = 4000;

export async function searchChatHistory(input: Record<string, unknown>) {
  const query = String(input.query || "")
    .trim()
    .toLowerCase();
  const limit = clampLimit(input.limit, CHAT_SEARCH_LIMIT, 1, 30);
  const chats = await storage.chats.get();
  const matches = chats
    .map((chat) => ({ chat, score: chatSearchScore(chat, query) }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || right.chat.updatedAt - left.chat.updatedAt,
    )
    .slice(0, limit)
    .map(({ chat }) => ({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: chat.messages.length,
      preview: chatPreview(chat),
    }));
  return { query, results: matches };
}

export async function readChatThread(input: Record<string, unknown>) {
  const chatId = String(input.chatId || input.id || "").trim();
  if (!chatId) return { error: "Missing chatId" };
  const limit = clampLimit(input.limit, CHAT_READ_MESSAGE_LIMIT, 1, 200);
  const chats = await storage.chats.get();
  const chat = chats.find((item) => item.id === chatId);
  if (!chat) return { error: "Chat thread not found", chatId };
  const messages = chat.messages.slice(-limit).map(readableMessage);
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messageCount: chat.messages.length,
    returnedMessages: messages.length,
    messages,
  };
}

export async function deleteChatThread(input: Record<string, unknown>) {
  const chatId = String(input.chatId || input.id || "").trim();
  if (!chatId) return { error: "Missing chatId" };
  const chats = await storage.chats.get();
  const chat = chats.find((item) => item.id === chatId);
  if (!chat) return { error: "Chat thread not found", chatId };
  await storage.chats.set(chats.filter((item) => item.id !== chatId));
  return { id: chat.id, title: chat.title, deleted: true };
}

function chatSearchScore(chat: Chat, query: string) {
  if (!query) return chat.updatedAt || 1;
  const titleScore = chat.title.toLowerCase().includes(query) ? 100 : 0;
  const messageScore = chat.messages.reduce(
    (score, message) =>
      score + (messageText(message).toLowerCase().includes(query) ? 1 : 0),
    0,
  );
  return titleScore + messageScore;
}

function chatPreview(chat: Chat) {
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

function clampLimit(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(number)));
}

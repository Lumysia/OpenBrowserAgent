import type { Chat, ChatPart } from "../../src/shared/types";
import {
  extractSourcesFromPart,
  mergeChatSources,
} from "../../src/shared/chat-sources";
import { applyPart } from "./stream-parts";

export function appendAssistantContent(
  chats: Chat[],
  chatId: string,
  messageId: string,
  content: string,
) {
  return chats.map((chat) =>
    chat.id === chatId
      ? {
          ...chat,
          messages: chat.messages.map((message) =>
            message.id === messageId
              ? { ...message, content: message.content + content }
              : message,
          ),
        }
      : chat,
  );
}

export function appendAssistantPart({
  chats,
  chatId,
  messageId,
  delta,
  part,
}: {
  chats: Chat[];
  chatId: string;
  messageId: string;
  delta?: string;
  part?: ChatPart;
}) {
  const sources = extractSourcesFromPart(part);
  return chats.map((chat) =>
    chat.id === chatId
      ? {
          ...chat,
          sources: sources.length
            ? mergeChatSources(chat.sources, sources)
            : chat.sources,
          messages: chat.messages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: delta ? message.content + delta : message.content,
                  parts: part ? applyPart(message.parts, part) : message.parts,
                }
              : message,
          ),
          updatedAt: Date.now(),
        }
      : chat,
  );
}

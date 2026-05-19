import type { Dispatch, SetStateAction } from "react";
import type { Chat, RunMetrics } from "../../src/shared/types";
import {
  appendAssistantContent,
  appendAssistantPart,
  appendQueuedMessages,
  updateAssistantRunMetrics,
} from "./chat-updates";
import { streamPartFromChunk } from "./stream-parts";

type ChatSetter = Dispatch<SetStateAction<Chat[]>>;

export function createStreamHandlers(setChats: ChatSetter) {
  return {
    appendToAssistant(chatId: string, messageId: string, content: string) {
      setChats((items) =>
        appendAssistantContent(items, chatId, messageId, content),
      );
    },
    appendStreamChunk(chatId: string, messageId: string, chunk: unknown) {
      const { delta, part } = streamPartFromChunk(chunk);
      if (!delta && !part) return;
      setChats((items) =>
        appendAssistantPart({ chats: items, chatId, messageId, delta, part }),
      );
    },
    updateRunMetrics(
      chatId: string,
      messageId: string,
      metrics: Partial<RunMetrics>,
    ) {
      setChats((items) =>
        updateAssistantRunMetrics(items, chatId, messageId, metrics),
      );
    },
    appendQueuedMessages(
      chatId: string,
      messages: Array<{ id: string; content: string; createdAt: number }>,
      assistantMessageId: string,
      createdAt: number,
    ) {
      setChats((items) =>
        appendQueuedMessages({
          chats: items,
          chatId,
          messages,
          assistantMessageId,
          createdAt,
        }),
      );
    },
  };
}

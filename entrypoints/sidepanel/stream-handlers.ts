import type { Dispatch, SetStateAction } from "react";
import { STREAM_RENDER_THROTTLE_MS } from "../../src/shared/config";
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
  const pendingText = new Map<string, PendingTextDelta>();

  function key(chatId: string, messageId: string, partId: string) {
    return `${chatId}:${messageId}:${partId}`;
  }

  function flushTextDelta(itemKey: string) {
    const item = pendingText.get(itemKey);
    if (!item) return;
    pendingText.delete(itemKey);
    if (item.timeout !== undefined) window.clearTimeout(item.timeout);
    setChats((items) =>
      appendAssistantPart({
        chats: items,
        chatId: item.chatId,
        messageId: item.messageId,
        delta: item.delta,
        part: {
          id: item.partId,
          type: "text",
          text: item.delta,
          append: true,
        },
      }),
    );
  }

  function flushMessageText(chatId: string, messageId: string) {
    for (const [itemKey, item] of pendingText) {
      if (item.chatId === chatId && item.messageId === messageId)
        flushTextDelta(itemKey);
    }
  }

  return {
    appendToAssistant(chatId: string, messageId: string, content: string) {
      setChats((items) =>
        appendAssistantContent(items, chatId, messageId, content),
      );
    },
    appendStreamChunk(chatId: string, messageId: string, chunk: unknown) {
      const { delta, part } = streamPartFromChunk(chunk);
      if (!delta && !part) return;
      if (delta && part?.type === "text" && part.append) {
        const partId = part.id;
        const itemKey = key(chatId, messageId, partId);
        const existing = pendingText.get(itemKey);
        if (existing) {
          existing.delta += delta;
          return;
        }
        pendingText.set(itemKey, {
          chatId,
          messageId,
          partId,
          delta,
          timeout: window.setTimeout(
            () => flushTextDelta(itemKey),
            STREAM_RENDER_THROTTLE_MS,
          ),
        });
        return;
      }
      flushMessageText(chatId, messageId);
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

type PendingTextDelta = {
  chatId: string;
  messageId: string;
  partId: string;
  delta: string;
  timeout?: number;
};

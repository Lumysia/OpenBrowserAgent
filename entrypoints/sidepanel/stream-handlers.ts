import { STREAM_RENDER_THROTTLE_MS } from "../../src/shared/config";
import type { ChatPart, RunMetrics } from "../../src/shared/types";
import {
  appendAssistantContent,
  appendAssistantPart,
  appendQueuedMessages,
  updateAssistantRunMetrics,
} from "./chat-updates";
import { streamPartFromChunk } from "./stream-parts";
import type { ChatUpdater } from "./use-chats";

export function createStreamHandlers(updateChat: ChatUpdater) {
  const pendingText = new Map<string, PendingTextDelta>();

  function key(chatId: string, messageId: string, partId: string) {
    return `${chatId}:${messageId}:${partId}`;
  }

  function flushTextDelta(itemKey: string) {
    const item = pendingText.get(itemKey);
    if (!item) return;
    pendingText.delete(itemKey);
    if (item.timeout !== undefined) window.clearTimeout(item.timeout);
    const part: ChatPart = {
      id: item.partId,
      type: item.partType,
      text: item.delta,
      append: true,
    };
    updateChat(item.chatId, (chat) =>
      appendAssistantPart(chat, {
        messageId: item.messageId,
        delta: item.partType === "text" ? item.delta : undefined,
        part,
        metrics: item.metrics,
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
      updateChat(chatId, (chat) =>
        appendAssistantContent(chat, messageId, content),
      );
    },
    appendStreamChunk(
      chatId: string,
      messageId: string,
      chunk: unknown,
      metrics?: Partial<RunMetrics>,
    ) {
      const { delta, part } = streamPartFromChunk(chunk);
      if (!delta && !part) return;
      if (isAppendableTextPart(part)) {
        const partId = part.id;
        const itemKey = key(chatId, messageId, partId);
        const partDelta = part.text || "";
        const existing = pendingText.get(itemKey);
        if (existing) {
          existing.delta += partDelta;
          existing.metrics = {
            ...(existing.metrics || {}),
            ...(metrics || {}),
          };
          return;
        }
        pendingText.set(itemKey, {
          chatId,
          messageId,
          partId,
          partType: part.type,
          delta: partDelta,
          metrics,
          timeout: window.setTimeout(
            () => flushTextDelta(itemKey),
            STREAM_RENDER_THROTTLE_MS,
          ),
        });
        return;
      }
      flushMessageText(chatId, messageId);
      updateChat(chatId, (chat) =>
        appendAssistantPart(chat, { messageId, delta, part, metrics }),
      );
    },
    updateRunMetrics(
      chatId: string,
      messageId: string,
      metrics: Partial<RunMetrics>,
      options?: { flushPendingText?: boolean },
    ) {
      if (options?.flushPendingText !== false)
        flushMessageText(chatId, messageId);
      updateChat(chatId, (chat) =>
        updateAssistantRunMetrics(chat, messageId, metrics),
      );
    },
    appendQueuedMessages(
      chatId: string,
      messages: Array<{ id: string; content: string; createdAt: number }>,
      assistantMessageId: string,
      createdAt: number,
      sequence?: number,
    ) {
      updateChat(chatId, (chat) =>
        appendQueuedMessages(chat, {
          messages,
          assistantMessageId,
          createdAt,
          sequence,
        }),
      );
    },
    flushMessageText,
  };
}

type PendingTextDelta = {
  chatId: string;
  messageId: string;
  partId: string;
  partType: "text" | "reasoning";
  delta: string;
  metrics?: Partial<RunMetrics>;
  timeout?: number;
};

function isAppendableTextPart(
  part: ChatPart | undefined,
): part is ChatPart & { type: "text" | "reasoning"; text: string } {
  return (
    !!part &&
    (part.type === "text" || part.type === "reasoning") &&
    !!part.append &&
    typeof part.text === "string" &&
    part.text.length > 0
  );
}

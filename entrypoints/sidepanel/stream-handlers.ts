import type { Dispatch, SetStateAction } from "react";
import { STREAM_RENDER_THROTTLE_MS } from "../../src/shared/config";
import {
  debugLog,
  isDebugLoggingEnabled,
} from "../../src/shared/debug-logging";
import type { Chat, ChatPart, RunMetrics } from "../../src/shared/types";
import { isToolPartType } from "../../src/shared/types";
import {
  appendAssistantContent,
  appendAssistantPart,
  appendQueuedMessages,
  updateAssistantRunMetrics,
} from "./chat-updates";
import { applyPart, streamPartFromChunk } from "./stream-parts";

type ChatSetter = Dispatch<SetStateAction<Chat[]>>;
type ChatGetter = () => Chat[];

export function createStreamHandlers(
  setChats: ChatSetter,
  getChats?: ChatGetter,
) {
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
    debugStreamOrder("flush-text", getChats, item.chatId, item.messageId, part);
    setChats((items) =>
      appendAssistantPart({
        chats: items,
        chatId: item.chatId,
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
      setChats((items) =>
        appendAssistantContent(items, chatId, messageId, content),
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
      debugStreamOrder(
        "chunk-received",
        getChats,
        chatId,
        messageId,
        part,
        delta,
      );
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
          debugPendingText("pending-append", chatId, messageId, part, existing);
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
        debugPendingText("pending-start", chatId, messageId, part, {
          chatId,
          messageId,
          partId,
          partType: part.type,
          delta: partDelta,
          metrics,
        });
        return;
      }
      flushMessageText(chatId, messageId);
      debugStreamOrder(
        "apply-immediate",
        getChats,
        chatId,
        messageId,
        part,
        delta,
      );
      setChats((items) =>
        appendAssistantPart({
          chats: items,
          chatId,
          messageId,
          delta,
          part,
          metrics,
        }),
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
    flushMessageText,
  };
}

function debugStreamOrder(
  event: string,
  getChats: ChatGetter | undefined,
  chatId: string,
  messageId: string,
  part?: ChatPart,
  delta?: string,
) {
  if (!isDebugLoggingEnabled()) return;
  if (!getChats) return;
  const message = getChats()
    .find((chat) => chat.id === chatId)
    ?.messages.find((item) => item.id === messageId);
  const before = message?.parts || [];
  const after = part ? applyPart(before, part) : before;
  debugLog("[OBA stream-order]", {
    event,
    chatId,
    messageId,
    contentLength: message?.content.length || 0,
    deltaLength: delta?.length || 0,
    part: part ? debugPart(part) : undefined,
    before: before.map(debugPart),
    after: after.map(debugPart),
  });
}

function debugPendingText(
  event: string,
  chatId: string,
  messageId: string,
  part: ChatPart,
  pending: Omit<PendingTextDelta, "timeout">,
) {
  if (!isDebugLoggingEnabled()) return;
  debugLog("[OBA stream-order]", {
    event,
    chatId,
    messageId,
    part: debugPart(part),
    pendingLength: pending.delta.length,
    metrics: pending.metrics,
  });
}

function debugPart(part: ChatPart) {
  return {
    id: part.id,
    type: part.type,
    toolName: isToolPartType(part.type) ? part.toolName : undefined,
    state: part.state,
    append: part.append === true,
    textLength: part.text?.length || 0,
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

import type { Chat, ChatPart, RunMetrics } from "../../src/shared/types";
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
                  metadata: delta
                    ? mergeRunMetrics(
                        message.metadata,
                        deltaRunMetrics(message.metadata, delta),
                      )
                    : message.metadata,
                }
              : message,
          ),
          updatedAt: Date.now(),
        }
      : chat,
  );
}

export function updateAssistantRunMetrics(
  chats: Chat[],
  chatId: string,
  messageId: string,
  metrics: Partial<RunMetrics>,
) {
  return chats.map((chat) =>
    chat.id === chatId
      ? {
          ...chat,
          messages: chat.messages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  metadata: mergeRunMetrics(message.metadata, metrics),
                }
              : message,
          ),
          updatedAt: Date.now(),
        }
      : chat,
  );
}

function mergeRunMetrics(
  metadata: Record<string, unknown> | undefined,
  metrics: Partial<RunMetrics>,
) {
  const current = (metadata?.runMetrics || {}) as RunMetrics;
  return {
    ...(metadata || {}),
    runMetrics: {
      ...current,
      ...metrics,
      usage: { ...(current.usage || {}), ...(metrics.usage || {}) },
    },
  };
}

function deltaRunMetrics(
  metadata: Record<string, unknown> | undefined,
  delta: string,
): Partial<RunMetrics> {
  const current = (metadata?.runMetrics || {}) as RunMetrics;
  const outputCharacters = Number(current.outputCharacters) || 0;
  return {
    firstTokenAt: current.firstTokenAt || Date.now(),
    outputMode: current.outputMode || "streaming",
    outputCharacters: outputCharacters + delta.length,
  };
}

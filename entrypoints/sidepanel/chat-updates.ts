import type {
  Chat,
  ChatMessage,
  ChatPart,
  ContextBudgetReport,
  RunMetrics,
} from "../../src/shared/types";
import { CHAT_PART_STATE } from "../../src/shared/types";
import {
  extractSourcesFromPart,
  mergeChatSources,
} from "../../src/shared/chat-sources";
import { applyPart } from "./stream-parts";

// Updates of one chat; each returns the chat unchanged when nothing applies.
// Streaming updates leave `updatedAt` alone, so the chat list does not change
// with every chunk; it moves when a message is added or a run ends.

export function appendAssistantContent(
  chat: Chat,
  messageId: string,
  content: string,
): Chat {
  return {
    ...chat,
    messages: chat.messages.map((message) =>
      message.id === messageId
        ? { ...message, content: message.content + content }
        : message,
    ),
  };
}

export function appendAssistantPart(
  chat: Chat,
  {
    messageId,
    delta,
    part,
    metrics,
  }: {
    messageId: string;
    delta?: string;
    part?: ChatPart;
    metrics?: Partial<RunMetrics>;
  },
): Chat {
  const sources = extractSourcesFromPart(part);
  return {
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
            metadata:
              delta || metrics
                ? mergeRunMetrics(message.metadata, {
                    ...(delta ? deltaRunMetrics(message.metadata, delta) : {}),
                    ...(metrics || {}),
                  })
                : message.metadata,
          }
        : message,
    ),
  };
}

export function updateAssistantRunMetrics(
  chat: Chat,
  messageId: string,
  metrics: Partial<RunMetrics>,
): Chat {
  return {
    ...chat,
    messages: chat.messages.map((message) =>
      message.id === messageId
        ? updateMessageRunMetrics(message, metrics)
        : message,
    ),
    ...(metrics.endedAt ? { updatedAt: Date.now() } : {}),
  };
}

function updateMessageRunMetrics(
  message: ChatMessage,
  metrics: Partial<RunMetrics>,
) {
  return {
    ...message,
    parts: appendContextSummaryPart(message, metrics.contextBudget),
    metadata: mergeRunMetrics(message.metadata, metrics),
  };
}

function appendContextSummaryPart(
  message: ChatMessage,
  budget: ContextBudgetReport | undefined,
) {
  const summary = budget?.compactionSummary?.trim();
  if (!summary) return message.parts;
  const parts = message.parts || [];
  if (
    parts.some(
      (part) => part.type === "summary" && part.text?.trim() === summary,
    )
  )
    return message.parts;
  return [
    ...parts,
    {
      id: `context-summary-${crypto.randomUUID()}`,
      type: "summary" as const,
      text: summary,
      state: CHAT_PART_STATE.done,
    },
  ];
}

export function appendQueuedMessages(
  chat: Chat,
  {
    messages,
    assistantMessageId,
    createdAt,
    sequence,
  }: {
    messages: Array<{ id: string; content: string; createdAt: number }>;
    assistantMessageId: string;
    createdAt: number;
    sequence?: number;
  },
): Chat {
  const existingIds = new Set(chat.messages.map((message) => message.id));
  const queuedMessages: ChatMessage[] = messages
    .filter((message) => !existingIds.has(message.id))
    .map((message) => ({
      id: message.id,
      role: "user",
      content: message.content,
      createdAt: message.createdAt,
    }));
  const assistantMessage: ChatMessage | undefined = existingIds.has(
    assistantMessageId,
  )
    ? undefined
    : {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        parts: [],
        createdAt,
        metadata: {
          runMetrics: {
            startedAt: createdAt,
            outputCharacters: 0,
            // Reattaching replays only events after this one.
            streamEventIndex: sequence,
          },
        },
      };
  if (!queuedMessages.length && !assistantMessage) return chat;
  return {
    ...chat,
    messages: [
      ...chat.messages,
      ...queuedMessages,
      ...(assistantMessage ? [assistantMessage] : []),
    ],
    updatedAt: Date.now(),
  };
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
      contextBudget: addContextBudget(
        current.contextBudget,
        metrics.contextBudget,
      ),
    },
  };
}

function addContextBudget(
  current: ContextBudgetReport | undefined,
  next: ContextBudgetReport | undefined,
) {
  if (!next) return current;
  return {
    originalChars: (current?.originalChars || 0) + next.originalChars,
    finalChars: (current?.finalChars || 0) + next.finalChars,
    prunedChars: (current?.prunedChars || 0) + next.prunedChars,
    prunedMessages: (current?.prunedMessages || 0) + next.prunedMessages,
    truncatedToolResults:
      (current?.truncatedToolResults || 0) + next.truncatedToolResults,
    compactionSummary: next.compactionSummary || current?.compactionSummary,
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
    outputCharacters: outputCharacters + delta.length,
  };
}

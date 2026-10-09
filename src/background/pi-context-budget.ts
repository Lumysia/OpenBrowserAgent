import type { Message, TextContent } from "@earendil-works/pi-ai";
import { getCurrentSystemMessage } from "@earendil-works/pi-ai/utils/transcript";
import {
  CONTEXT_PRUNED_PREVIEW_CHARS,
  CONTEXT_TOOL_RESULT_KEEP_RECENT,
} from "../shared/config";
import type { ContextBudgetReport, Preferences } from "../shared/types";
import {
  compactedContextPlaceholder,
  compactedContextSummary,
} from "./compaction-prompt";
import { resolveContextBudgetSettings } from "./context-budget-settings";

export function applyPiContextBudget(
  messages: Message[],
  preferences: Preferences,
  modelContextLength?: number,
  summary?: string,
): { messages: Message[]; report: ContextBudgetReport } {
  const settings = resolveContextBudgetSettings(
    preferences,
    modelContextLength,
  );
  const originalChars = contextLength(messages);
  let truncatedToolResults = 0;
  let prunedMessages = 0;
  let items = messages;
  if (settings.enabled) {
    let images = 0;
    let tools = 0;
    let toolChars = 0;
    items = [...messages]
      .reverse()
      .map((message): Message => {
        if (message.role !== "toolResult" && message.role !== "user")
          return message;
        if (typeof message.content === "string") return message;
        const content = message.content.map((part): typeof part => {
          if (part.type !== "image" || ++images <= 1) return part;
          truncatedToolResults++;
          return {
            type: "text",
            text: "[Previous image omitted to preserve context budget. Re-read or re-capture it if visual evidence is still needed.]",
          };
        });
        if (message.role === "user") return { ...message, content };
        tools++;
        const chars = contextLength(content);
        toolChars += chars;
        if (
          tools <= CONTEXT_TOOL_RESULT_KEEP_RECENT &&
          chars <= settings.toolResultMaxChars &&
          toolChars <= settings.toolResultAggregateMaxChars
        )
          return { ...message, content };
        truncatedToolResults++;
        return {
          ...message,
          content: content.map((part) =>
            part.type === "text" ? pruneToolText(part) : part,
          ),
        };
      })
      .reverse();
    // Collapse system/tool deltas before windowing so removing older messages
    // cannot revive a removed tool or discard the active system instructions.
    const system = getCurrentSystemMessage(items);
    items = [
      ...(system ? [system] : []),
      ...items.filter((message) => message.role !== "system"),
    ];
    if (contextLength(items) > settings.requestMaxChars) {
      const keep = new Set<number>();
      if (items[0]?.role === "system") keep.add(0);
      const latestUser = items.findLastIndex(
        (message) =>
          message.role === "user" &&
          !/<internal_instruction>|<context_pruned>|<context_compacted>/.test(
            messageText(message),
          ),
      );
      if (latestUser >= 0) keep.add(latestUser);
      let tailChars = 0;
      let tailMessages = 0;
      for (let index = items.length - 1; index >= 0; index--) {
        const chars = contextLength(items[index]);
        if (
          tailMessages >= settings.tailMinMessages &&
          tailChars + chars > settings.tailMaxChars
        )
          break;
        keep.add(index);
        tailChars += chars;
        tailMessages++;
      }
      // Protect complete tool batches, including siblings in a multi-call turn.
      const batches = new Map<string, number[]>();
      items.forEach((message, index) => {
        if (message.role !== "assistant") return;
        const calls = message.content.filter(
          (part) => part.type === "toolCall",
        );
        const batch = [index];
        calls.forEach((call) => batches.set(call.id, batch));
      });
      items.forEach((message, index) => {
        if (message.role === "toolResult")
          batches.get(message.toolCallId)?.push(index);
      });
      for (const batch of batches.values())
        if (batch.some((index) => keep.has(index)))
          batch.forEach((index) => keep.add(index));
      const removed = items.filter((_, index) => !keep.has(index));
      prunedMessages = removed.length;
      if (prunedMessages) {
        items = items.filter((_, index) => keep.has(index));
        const note: Message = {
          role: "user",
          timestamp: Date.now(),
          content: summary
            ? compactedContextSummary(summary)
            : compactedContextPlaceholder(
                prunedMessages,
                contextLength(removed),
              ),
        };
        items.splice(items[0]?.role === "system" ? 1 : 0, 0, note);
      }
    }
  }
  const finalChars = contextLength(items);
  return {
    messages: items,
    report: {
      originalChars,
      finalChars,
      prunedChars: Math.max(0, originalChars - finalChars),
      prunedMessages,
      truncatedToolResults,
      compactionSummary: summary,
    },
  };
}

export function contextLength(value: unknown): number {
  return JSON.stringify(value, (key, item) => {
    if (key === "details") return undefined;
    if (item && typeof item === "object" && item.type === "image")
      return {
        type: "image",
        data: "[image payload]",
        mimeType: item.mimeType,
      };
    return item;
  }).length;
}

export function messageText(message: Message) {
  if (typeof message.content === "string") return message.content;
  return message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
}

function pruneToolText(part: TextContent): TextContent {
  let preserved: Record<string, unknown> | undefined;
  try {
    const value = JSON.parse(part.text);
    preserved = Object.fromEntries(
      [
        "success",
        "operation",
        "categories",
        "summary",
        "loadedToolNames",
        "unavailableMatches",
        "unknownNames",
        "tools",
      ]
        .filter((key) => value?.[key] !== undefined)
        .map((key) => [
          key,
          key === "tools" && Array.isArray(value.tools)
            ? value.tools.map((tool: Record<string, unknown>) => ({
                name: tool.name,
                category: tool.category,
                available: tool.available,
                unavailableReason: tool.unavailableReason,
              }))
            : value[key],
        ]),
    );
  } catch {
    /* Non-JSON tool results still retain their preview. */
  }
  return {
    type: "text",
    text: JSON.stringify({
      contextPruned: true,
      originalChars: part.text.length,
      preview: part.text.slice(0, CONTEXT_PRUNED_PREVIEW_CHARS),
      preserved,
      note: "Older tool output was pruned. Re-run or read the relevant tool data if exact output is needed.",
    }),
  };
}

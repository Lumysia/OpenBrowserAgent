import {
  CONTEXT_PRUNED_PREVIEW_CHARS,
  CONTEXT_TOOL_RESULT_KEEP_RECENT,
  DEFAULT_CONTEXT_BUDGET_ENABLED,
  DEFAULT_CONTEXT_REQUEST_MAX_CHARS,
  DEFAULT_CONTEXT_TAIL_MAX_CHARS,
  DEFAULT_CONTEXT_TAIL_MIN_MESSAGES,
  DEFAULT_CONTEXT_TOOL_RESULT_AGGREGATE_MAX_CHARS,
  DEFAULT_CONTEXT_TOOL_RESULT_MAX_CHARS,
} from "../shared/config";
import type { ContextBudgetReport, Preferences } from "../shared/types";

type BudgetResult<T> = { items: T[]; report: ContextBudgetReport };
type ContextBudgetSettings = ReturnType<typeof resolveContextBudgetSettings>;

const noPruning = { prunedMessages: 0, truncatedToolResults: 0 };

export function applyAnthropicContextBudget(
  messages: Array<Record<string, unknown>>,
  preferences: Preferences,
): BudgetResult<Record<string, unknown>> {
  const settings = resolveContextBudgetSettings(preferences);
  const originalChars = jsonLength(messages);
  if (!settings.enabled) return withReport(originalChars, messages, noPruning);
  const toolPruned = pruneAnthropicToolResults(messages, settings);
  const windowed = applySlidingWindow(
    toolPruned.items,
    settings,
    createAnthropicPrunedNote,
    protectAnthropicToolPairs,
  );
  return withReport(originalChars, windowed.items, {
    prunedMessages: windowed.prunedMessages,
    truncatedToolResults: toolPruned.truncatedToolResults,
  });
}

function pruneAnthropicToolResults(
  messages: Array<Record<string, unknown>>,
  settings: ContextBudgetSettings,
) {
  let keptToolResults = 0;
  let aggregateChars = 0;
  let truncatedToolResults = 0;
  const items = [...messages].reverse().map((message) => {
    const content = Array.isArray(message.content) ? message.content : [];
    const nextContent = content.map((block) => {
      if (!block || typeof block !== "object") return block;
      const record = block as Record<string, unknown>;
      if (record.type !== "tool_result") return block;
      const chars = jsonLength(record.content);
      keptToolResults += 1;
      aggregateChars += chars;
      const shouldKeep =
        keptToolResults <= CONTEXT_TOOL_RESULT_KEEP_RECENT &&
        chars <= settings.toolResultMaxChars &&
        aggregateChars <= settings.toolResultAggregateMaxChars;
      if (shouldKeep) return block;
      truncatedToolResults += 1;
      return {
        ...record,
        content: prunedToolText(safeStringify(record.content)),
      };
    });
    return nextContent === content
      ? message
      : { ...message, content: nextContent };
  });
  return { items: items.reverse(), truncatedToolResults };
}

function applySlidingWindow<T extends Record<string, unknown>>(
  items: T[],
  settings: ContextBudgetSettings,
  createNote: (count: number, chars: number) => T,
  protectLinkedItems?: (items: T[], protectedIndexes: Set<number>) => void,
) {
  if (jsonLength(items) <= settings.requestMaxChars)
    return { items, prunedMessages: 0 };
  const protectedIndexes = new Set<number>();
  let tailChars = 0;
  let tailMessages = 0;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const chars = jsonLength(items[index]);
    const protect =
      tailMessages < settings.tailMinMessages ||
      tailChars + chars <= settings.tailMaxChars;
    if (!protect) break;
    protectedIndexes.add(index);
    tailChars += chars;
    tailMessages += 1;
  }
  protectLinkedItems?.(items, protectedIndexes);
  const pruned = items.filter((_, index) => !protectedIndexes.has(index));
  const kept = items.filter((_, index) => protectedIndexes.has(index));
  if (!pruned.length) return { items, prunedMessages: 0 };
  return {
    items: [createNote(pruned.length, jsonLength(pruned)), ...kept],
    prunedMessages: pruned.length,
  };
}

function protectAnthropicToolPairs(
  items: Array<Record<string, unknown>>,
  protectedIndexes: Set<number>,
) {
  const useIndexes = new Map<string, number>();
  const resultIndexes = new Map<string, number[]>();
  items.forEach((message, index) => {
    const content = Array.isArray(message.content) ? message.content : [];
    content.forEach((block) => {
      if (!block || typeof block !== "object") return;
      const record = block as Record<string, unknown>;
      if (record.type === "tool_use" && typeof record.id === "string")
        useIndexes.set(record.id, index);
      if (
        record.type === "tool_result" &&
        typeof record.tool_use_id === "string"
      ) {
        const indexes = resultIndexes.get(record.tool_use_id) || [];
        indexes.push(index);
        resultIndexes.set(record.tool_use_id, indexes);
      }
    });
  });
  let changed = true;
  while (changed) {
    changed = false;
    items.forEach((message, index) => {
      if (!protectedIndexes.has(index)) return;
      const content = Array.isArray(message.content) ? message.content : [];
      content.forEach((block) => {
        if (!block || typeof block !== "object") return;
        const record = block as Record<string, unknown>;
        const ids = [record.id, record.tool_use_id].filter(
          (id): id is string => typeof id === "string",
        );
        ids.forEach((id) => {
          const useIndex = useIndexes.get(id);
          if (useIndex !== undefined && !protectedIndexes.has(useIndex)) {
            protectedIndexes.add(useIndex);
            changed = true;
          }
          (resultIndexes.get(id) || []).forEach((resultIndex) => {
            if (protectedIndexes.has(resultIndex)) return;
            protectedIndexes.add(resultIndex);
            changed = true;
          });
        });
      });
    });
  }
}

function resolveContextBudgetSettings(preferences: Preferences) {
  const toolResultMaxChars = clampNumber(
    preferences.contextToolResultMaxChars,
    DEFAULT_CONTEXT_TOOL_RESULT_MAX_CHARS,
    1_000,
    96_000,
  );
  return {
    enabled: preferences.contextBudgetEnabled ?? DEFAULT_CONTEXT_BUDGET_ENABLED,
    requestMaxChars: clampNumber(
      preferences.contextRequestMaxChars,
      DEFAULT_CONTEXT_REQUEST_MAX_CHARS,
      16_000,
      500_000,
    ),
    tailMinMessages: clampNumber(
      preferences.contextTailMinMessages,
      DEFAULT_CONTEXT_TAIL_MIN_MESSAGES,
      2,
      40,
    ),
    tailMaxChars: DEFAULT_CONTEXT_TAIL_MAX_CHARS,
    toolResultMaxChars,
    toolResultAggregateMaxChars: Math.max(
      DEFAULT_CONTEXT_TOOL_RESULT_AGGREGATE_MAX_CHARS,
      toolResultMaxChars * CONTEXT_TOOL_RESULT_KEEP_RECENT,
    ),
  };
}

function createAnthropicPrunedNote(count: number, chars: number) {
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: `<context_pruned>Older conversation history was omitted from this request to stay within the context budget. Omitted messages: ${count}. Omitted chars: ${chars}. Continue from the preserved recent messages and ask if an omitted detail is required.</context_pruned>`,
      },
    ],
  };
}

function prunedToolText(content: string) {
  return JSON.stringify({
    contextPruned: true,
    originalChars: content.length,
    preview: content.slice(0, CONTEXT_PRUNED_PREVIEW_CHARS),
    preserved: preservePrunedToolFields(content),
    note: "Older tool output was pruned from this request. Re-run or read the relevant tool data again if exact raw output is needed.",
  });
}

function preservePrunedToolFields(content: string) {
  const parsed = parseJsonObject(content);
  if (!parsed) return undefined;
  const tools = Array.isArray(parsed.tools)
    ? parsed.tools
        .map((tool) => {
          const object = tool && typeof tool === "object" ? tool : undefined;
          if (!object) return undefined;
          const record = object as Record<string, unknown>;
          return {
            name: record.name,
            category: record.category,
            available: record.available,
            unavailableReason: record.unavailableReason,
          };
        })
        .filter(Boolean)
    : undefined;
  const preserved = {
    success: parsed.success,
    operation: parsed.operation,
    categories: parsed.categories,
    summary: parsed.summary,
    loadedToolNames: parsed.loadedToolNames,
    unavailableMatches: parsed.unavailableMatches,
    unknownNames: parsed.unknownNames,
    tools,
  };
  return Object.fromEntries(
    Object.entries(preserved).filter(([, value]) => value !== undefined),
  );
}

function parseJsonObject(content: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function withReport<T>(
  originalChars: number,
  items: T[],
  report: Pick<ContextBudgetReport, "prunedMessages" | "truncatedToolResults">,
): BudgetResult<T> {
  const finalChars = jsonLength(items);
  return {
    items,
    report: {
      originalChars,
      finalChars,
      prunedChars: Math.max(0, originalChars - finalChars),
      prunedMessages: report.prunedMessages,
      truncatedToolResults: report.truncatedToolResults,
    },
  };
}

function clampNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value || fallback)));
}

function jsonLength(value: unknown) {
  return safeStringify(value).length;
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value) || "";
  } catch {
    return String(value || "");
  }
}

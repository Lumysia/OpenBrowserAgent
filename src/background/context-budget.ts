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

export function applyOpenAIContextBudget(
  messages: Array<Record<string, unknown>>,
  preferences: Preferences,
): BudgetResult<Record<string, unknown>> {
  const settings = resolveContextBudgetSettings(preferences);
  const originalChars = jsonLength(messages);
  if (!settings.enabled) return withReport(originalChars, messages, noPruning);
  const toolPruned = pruneOpenAIToolResults(messages, settings);
  const windowed = applySlidingWindow(
    toolPruned.items,
    settings,
    createOpenAIPrunedNote,
  );
  return withReport(originalChars, windowed.items, {
    prunedMessages: windowed.prunedMessages,
    truncatedToolResults: toolPruned.truncatedToolResults,
  });
}

export function applyGeminiContextBudget(
  contents: Array<Record<string, unknown>>,
  preferences: Preferences,
): BudgetResult<Record<string, unknown>> {
  const settings = resolveContextBudgetSettings(preferences);
  const originalChars = jsonLength(contents);
  if (!settings.enabled) return withReport(originalChars, contents, noPruning);
  const toolPruned = pruneGeminiToolResults(contents, settings);
  const windowed = applySlidingWindow(
    toolPruned.items,
    settings,
    createGeminiPrunedNote,
  );
  return withReport(originalChars, windowed.items, {
    prunedMessages: windowed.prunedMessages,
    truncatedToolResults: toolPruned.truncatedToolResults,
  });
}

const noPruning = { prunedMessages: 0, truncatedToolResults: 0 };

function pruneOpenAIToolResults(
  messages: Array<Record<string, unknown>>,
  settings: ContextBudgetSettings,
) {
  let keptToolResults = 0;
  let aggregateChars = 0;
  let truncatedToolResults = 0;
  const items = [...messages].reverse().map((message) => {
    if (message.role !== "tool" || typeof message.content !== "string")
      return message;
    const chars = message.content.length;
    keptToolResults += 1;
    aggregateChars += chars;
    const shouldKeep =
      keptToolResults <= CONTEXT_TOOL_RESULT_KEEP_RECENT &&
      chars <= settings.toolResultMaxChars &&
      aggregateChars <= settings.toolResultAggregateMaxChars;
    if (shouldKeep) return message;
    truncatedToolResults += 1;
    return {
      ...message,
      content: prunedToolText(message.content),
    };
  });
  return { items: items.reverse(), truncatedToolResults };
}

function pruneGeminiToolResults(
  contents: Array<Record<string, unknown>>,
  settings: ContextBudgetSettings,
) {
  let keptToolResults = 0;
  let aggregateChars = 0;
  let truncatedToolResults = 0;
  const items = [...contents].reverse().map((content) => {
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const nextParts = parts.map((part) => {
      if (!part || typeof part !== "object" || !("functionResponse" in part))
        return part;
      const response = (part as { functionResponse?: Record<string, unknown> })
        .functionResponse;
      const chars = jsonLength(response?.response);
      keptToolResults += 1;
      aggregateChars += chars;
      const shouldKeep =
        keptToolResults <= CONTEXT_TOOL_RESULT_KEEP_RECENT &&
        chars <= settings.toolResultMaxChars &&
        aggregateChars <= settings.toolResultAggregateMaxChars;
      if (shouldKeep) return part;
      truncatedToolResults += 1;
      return {
        ...part,
        functionResponse: {
          ...response,
          response: prunedToolObject(response?.response),
        },
      };
    });
    return nextParts === parts ? content : { ...content, parts: nextParts };
  });
  return { items: items.reverse(), truncatedToolResults };
}

function applySlidingWindow<T extends Record<string, unknown>>(
  items: T[],
  settings: ContextBudgetSettings,
  createNote: (count: number, chars: number) => T,
) {
  if (jsonLength(items) <= settings.requestMaxChars)
    return { items, prunedMessages: 0 };

  const protectedIndexes = new Set<number>();
  if (items[0]?.role === "system") protectedIndexes.add(0);

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

  const pruned = items.filter((_, index) => !protectedIndexes.has(index));
  const kept = items.filter((_, index) => protectedIndexes.has(index));
  if (!pruned.length) return { items, prunedMessages: 0 };

  const note = createNote(pruned.length, jsonLength(pruned));
  const nextItems =
    kept[0]?.role === "system"
      ? [kept[0], note, ...kept.slice(1)]
      : [note, ...kept];
  return { items: nextItems, prunedMessages: pruned.length };
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

function clampNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value || fallback)));
}

function createOpenAIPrunedNote(count: number, chars: number) {
  return {
    role: "user",
    content: `<context_pruned>Older conversation history was omitted from this request to stay within the context budget. Omitted messages: ${count}. Omitted chars: ${chars}. Continue from the preserved recent messages and ask if an omitted detail is required.</context_pruned>`,
  };
}

function createGeminiPrunedNote(count: number, chars: number) {
  return {
    role: "user",
    parts: [{ text: String(createOpenAIPrunedNote(count, chars).content) }],
  };
}

function prunedToolText(content: string) {
  return JSON.stringify({
    contextPruned: true,
    originalChars: content.length,
    preview: content.slice(0, CONTEXT_PRUNED_PREVIEW_CHARS),
    note: "Older tool output was pruned from this request. Re-run or read the relevant tool data again if exact raw output is needed.",
  });
}

function prunedToolObject(value: unknown) {
  const text = safeStringify(value);
  return {
    contextPruned: true,
    originalChars: text.length,
    preview: text.slice(0, CONTEXT_PRUNED_PREVIEW_CHARS),
    note: "Older tool output was pruned from this request. Re-run or read the relevant tool data again if exact raw output is needed.",
  };
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

function jsonLength(value: unknown) {
  return safeStringify(value).length;
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value) || "";
  } catch {
    return String(value);
  }
}

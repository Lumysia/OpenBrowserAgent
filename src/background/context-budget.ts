import {
  CONTEXT_PRUNED_PREVIEW_CHARS,
  CONTEXT_TOOL_RESULT_KEEP_RECENT,
} from "../shared/config";
import type { ContextBudgetReport, Preferences } from "../shared/types";
import {
  compactedContextPlaceholder,
  compactedContextSummary,
} from "./compaction-prompt";
import {
  latestRealUserMessageIndex,
  pruneGeminiVisionMessages,
  pruneOpenAIResponsesVisionMessages,
  pruneOpenAIVisionMessages,
} from "./context-budget-helpers";
import {
  type ContextBudgetSettings,
  resolveContextBudgetSettings,
} from "./context-budget-settings";

type BudgetResult<T> = { items: T[]; report: ContextBudgetReport };

export function applyOpenAIContextBudget(
  messages: Array<Record<string, unknown>>,
  preferences: Preferences,
  compactionSummary?: string,
  modelContextLength?: number,
): BudgetResult<Record<string, unknown>> {
  const settings = resolveContextBudgetSettings(
    preferences,
    modelContextLength,
  );
  const originalChars = jsonLength(messages);
  if (!settings.enabled) return withReport(originalChars, messages, noPruning);
  const mediaPruned = pruneOpenAIVisionMessages(messages);
  const toolPruned = pruneOpenAIToolResults(mediaPruned.items, settings);
  const windowed = applySlidingWindow(
    toolPruned.items,
    settings,
    (count, chars) => createOpenAIPrunedNote(count, chars, compactionSummary),
    protectOpenAIToolPairs,
  );
  return withReport(originalChars, windowed.items, {
    prunedMessages: windowed.prunedMessages,
    truncatedToolResults:
      toolPruned.truncatedToolResults + mediaPruned.truncatedToolResults,
    compactionSummary,
  });
}

export function applyOpenAIResponsesContextBudget(
  input: Array<Record<string, unknown>>,
  preferences: Preferences,
  compactionSummary?: string,
  modelContextLength?: number,
): BudgetResult<Record<string, unknown>> {
  const settings = resolveContextBudgetSettings(
    preferences,
    modelContextLength,
  );
  const originalChars = jsonLength(input);
  if (!settings.enabled) return withReport(originalChars, input, noPruning);
  const mediaPruned = pruneOpenAIResponsesVisionMessages(input);
  const toolPruned = pruneOpenAIResponsesToolResults(
    mediaPruned.items,
    settings,
  );
  const windowed = applySlidingWindow(
    toolPruned.items,
    settings,
    (count, chars) =>
      createOpenAIResponsesPrunedNote(count, chars, compactionSummary),
    protectOpenAIResponsesToolPairs,
  );
  return withReport(originalChars, windowed.items, {
    prunedMessages: windowed.prunedMessages,
    truncatedToolResults:
      toolPruned.truncatedToolResults + mediaPruned.truncatedToolResults,
    compactionSummary,
  });
}

export function applyGeminiContextBudget(
  contents: Array<Record<string, unknown>>,
  preferences: Preferences,
  modelContextLength?: number,
): BudgetResult<Record<string, unknown>> {
  const settings = resolveContextBudgetSettings(
    preferences,
    modelContextLength,
  );
  const originalChars = jsonLength(contents);
  if (!settings.enabled) return withReport(originalChars, contents, noPruning);
  const mediaPruned = pruneGeminiVisionMessages(contents);
  const toolPruned = pruneGeminiToolResults(mediaPruned.items, settings);
  const windowed = applySlidingWindow(
    toolPruned.items,
    settings,
    createGeminiPrunedNote,
  );
  return withReport(originalChars, windowed.items, {
    prunedMessages: windowed.prunedMessages,
    truncatedToolResults:
      toolPruned.truncatedToolResults + mediaPruned.truncatedToolResults,
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

function pruneOpenAIResponsesToolResults(
  input: Array<Record<string, unknown>>,
  settings: ContextBudgetSettings,
) {
  let keptToolResults = 0;
  let aggregateChars = 0;
  let truncatedToolResults = 0;
  const items = [...input].reverse().map((item) => {
    if (item.type !== "function_call_output" || typeof item.output !== "string")
      return item;
    const chars = item.output.length;
    keptToolResults += 1;
    aggregateChars += chars;
    const shouldKeep =
      keptToolResults <= CONTEXT_TOOL_RESULT_KEEP_RECENT &&
      chars <= settings.toolResultMaxChars &&
      aggregateChars <= settings.toolResultAggregateMaxChars;
    if (shouldKeep) return item;
    truncatedToolResults += 1;
    return { ...item, output: prunedToolText(item.output) };
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
  if (items[0]?.role === "system") protectedIndexes.add(0);
  const latestUserIndex = latestRealUserMessageIndex(items);
  if (latestUserIndex !== undefined) protectedIndexes.add(latestUserIndex);

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

  const note = createNote(pruned.length, jsonLength(pruned));
  const nextItems =
    kept[0]?.role === "system"
      ? [kept[0], note, ...kept.slice(1)]
      : [note, ...kept];
  return { items: nextItems, prunedMessages: pruned.length };
}

function protectOpenAIToolPairs(
  items: Array<Record<string, unknown>>,
  protectedIndexes: Set<number>,
) {
  const assistantIndexes = new Map<string, number>();
  const toolIndexes = new Map<string, number[]>();

  items.forEach((message, index) => {
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      message.tool_calls.forEach((toolCall) => {
        const id = recordString(toolCall, "id");
        if (id) assistantIndexes.set(id, index);
      });
      return;
    }
    if (message.role !== "tool") return;
    const id = recordString(message, "tool_call_id");
    if (!id) return;
    const indexes = toolIndexes.get(id) || [];
    indexes.push(index);
    toolIndexes.set(id, indexes);
  });

  let changed = true;
  while (changed) {
    changed = false;
    items.forEach((message, index) => {
      if (!protectedIndexes.has(index)) return;
      if (message.role === "tool") {
        const assistantIndex = assistantIndexes.get(
          recordString(message, "tool_call_id"),
        );
        if (
          assistantIndex !== undefined &&
          !protectedIndexes.has(assistantIndex)
        ) {
          protectedIndexes.add(assistantIndex);
          changed = true;
        }
        return;
      }
      if (message.role !== "assistant" || !Array.isArray(message.tool_calls))
        return;
      message.tool_calls.forEach((toolCall) => {
        const id = recordString(toolCall, "id");
        if (!id) return;
        (toolIndexes.get(id) || []).forEach((toolIndex) => {
          if (protectedIndexes.has(toolIndex)) return;
          protectedIndexes.add(toolIndex);
          changed = true;
        });
      });
    });
  }
}

function protectOpenAIResponsesToolPairs(
  items: Array<Record<string, unknown>>,
  protectedIndexes: Set<number>,
) {
  const callIndexes = new Map<string, number>();
  const outputIndexes = new Map<string, number[]>();
  items.forEach((item, index) => {
    const callId = recordString(item, "call_id");
    if (!callId) return;
    if (item.type === "function_call") callIndexes.set(callId, index);
    if (item.type === "function_call_output") {
      const indexes = outputIndexes.get(callId) || [];
      indexes.push(index);
      outputIndexes.set(callId, indexes);
    }
  });
  let changed = true;
  while (changed) {
    changed = false;
    items.forEach((item, index) => {
      if (!protectedIndexes.has(index)) return;
      const callId = recordString(item, "call_id");
      if (!callId) return;
      const callIndex = callIndexes.get(callId);
      if (callIndex !== undefined && !protectedIndexes.has(callIndex)) {
        protectedIndexes.add(callIndex);
        changed = true;
      }
      (outputIndexes.get(callId) || []).forEach((outputIndex) => {
        if (protectedIndexes.has(outputIndex)) return;
        protectedIndexes.add(outputIndex);
        changed = true;
      });
    });
  }
}

function recordString(value: unknown, key: string) {
  return value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>)[key] === "string"
    ? String((value as Record<string, unknown>)[key])
    : "";
}

function createOpenAIPrunedNote(
  count: number,
  chars: number,
  compactionSummary?: string,
) {
  return {
    role: "user",
    content: compactionSummary
      ? compactedContextSummary(compactionSummary)
      : compactedContextPlaceholder(count, chars),
  };
}

function createOpenAIResponsesPrunedNote(
  count: number,
  chars: number,
  compactionSummary?: string,
) {
  return {
    role: "user",
    content: [
      {
        type: "input_text",
        text: String(
          createOpenAIPrunedNote(count, chars, compactionSummary).content,
        ),
      },
    ],
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
    preserved: preservePrunedToolFields(content),
    note: "Older tool output was pruned from this request. Re-run or read the relevant tool data again if exact raw output is needed.",
  });
}

function prunedToolObject(value: unknown) {
  const text = safeStringify(value);
  return {
    contextPruned: true,
    originalChars: text.length,
    preview: text.slice(0, CONTEXT_PRUNED_PREVIEW_CHARS),
    preserved: preservePrunedToolFields(text),
    note: "Older tool output was pruned from this request. Re-run or read the relevant tool data again if exact raw output is needed.",
  };
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
  report: Pick<
    ContextBudgetReport,
    "prunedMessages" | "truncatedToolResults" | "compactionSummary"
  >,
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
      compactionSummary: report.compactionSummary,
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

import {
  CONTEXT_TOOL_RESULT_KEEP_RECENT,
  DEFAULT_CONTEXT_BUDGET_ENABLED,
  DEFAULT_CONTEXT_REQUEST_MAX_CHARS,
  DEFAULT_CONTEXT_TAIL_MAX_CHARS,
  DEFAULT_CONTEXT_TAIL_MIN_MESSAGES,
  DEFAULT_CONTEXT_TOOL_RESULT_AGGREGATE_MAX_CHARS,
  DEFAULT_CONTEXT_TOOL_RESULT_MAX_CHARS,
  ESTIMATED_CHARS_PER_TOKEN,
  MAX_CONTEXT_BUDGET_TOKENS,
} from "../shared/config";
import { modelContextChars } from "../shared/model-context";
import type { Preferences } from "../shared/types";

export type ContextBudgetSettings = ReturnType<
  typeof resolveContextBudgetSettings
>;

export function resolveContextBudgetSettings(
  preferences: Preferences,
  modelContextLength?: number,
) {
  const toolResultMaxChars = clampNumber(
    preferences.contextToolResultMaxChars,
    DEFAULT_CONTEXT_TOOL_RESULT_MAX_CHARS,
    1_000,
    96_000,
  );
  const modelRequestMaxChars = modelContextChars(modelContextLength);
  const requestMaxChars =
    modelRequestMaxChars &&
    preferences.contextRequestMaxChars === DEFAULT_CONTEXT_REQUEST_MAX_CHARS
      ? modelRequestMaxChars
      : preferences.contextRequestMaxChars;
  return {
    enabled: preferences.contextBudgetEnabled ?? DEFAULT_CONTEXT_BUDGET_ENABLED,
    requestMaxChars: clampNumber(
      requestMaxChars,
      DEFAULT_CONTEXT_REQUEST_MAX_CHARS,
      16_000,
      MAX_CONTEXT_BUDGET_TOKENS * ESTIMATED_CHARS_PER_TOKEN,
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

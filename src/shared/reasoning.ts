import type { ProviderId } from "./types";

export const REASONING_EFFORT = {
  default: "default",
  low: "low",
  medium: "medium",
  high: "high",
} as const;

export type ReasoningEffort =
  (typeof REASONING_EFFORT)[keyof typeof REASONING_EFFORT];

// Quick tasks (smart bar actions, page translation) ask for the least
// thinking the endpoint allows, whatever the user's effort setting.
export const QUICK_TASK_REASONING = "quick";

// What a request asks of the model's reasoning.
export type RequestReasoning = ReasoningEffort | typeof QUICK_TASK_REASONING;

export const REASONING_EFFORT_OPTIONS: ReasoningEffort[] = [
  REASONING_EFFORT.default,
  REASONING_EFFORT.low,
  REASONING_EFFORT.medium,
  REASONING_EFFORT.high,
];

const OPENAI_REASONING_EFFORT_PROVIDERS = new Set<ProviderId>([
  "openai",
  "openai-responses",
  "deepseek",
  "aihubmix",
  "glm",
]);

export function reasoningRequestParams(
  provider: ProviderId,
  effort: ReasoningEffort | undefined,
): Record<string, unknown> {
  if (!effort || effort === REASONING_EFFORT.default) return {};
  if (provider === "openrouter") return { reasoning: { effort } };
  if (OPENAI_REASONING_EFFORT_PROVIDERS.has(provider))
    return { reasoning_effort: effort };
  return {};
}

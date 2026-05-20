import type { ProviderId } from "./types";

export const REASONING_EFFORT = {
  default: "default",
  low: "low",
  medium: "medium",
  high: "high",
} as const;

export type ReasoningEffort =
  (typeof REASONING_EFFORT)[keyof typeof REASONING_EFFORT];

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

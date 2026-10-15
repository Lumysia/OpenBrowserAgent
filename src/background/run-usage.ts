import type { Usage } from "@earendil-works/pi-ai";
import type { RunMetrics, TokenUsage } from "../shared/types";

export type UsageMetrics = Pick<
  RunMetrics,
  "usage" | "modelCalls" | "largestInputTokens"
>;

// Provider-reported usage per model request, summed for one assistant
// message. Input counts cached and cache-write tokens, as providers bill them.
export function createUsageMeter() {
  let metrics: UsageMetrics = {};
  return {
    // A new assistant message (queued input consumed) starts its own totals.
    reset() {
      metrics = {};
    },
    // Totals of a run made for this one (a sub-agent's).
    add(other: UsageMetrics): UsageMetrics {
      metrics = {
        usage: addTokenUsage(metrics.usage, other.usage),
        modelCalls: (metrics.modelCalls || 0) + (other.modelCalls || 0),
        largestInputTokens: Math.max(
          metrics.largestInputTokens || 0,
          other.largestInputTokens || 0,
        ),
      };
      return metrics;
    },
    record(usage: Usage): UsageMetrics {
      const input = usage.input + usage.cacheRead + usage.cacheWrite;
      metrics = {
        usage: addTokenUsage(metrics.usage, {
          inputTokens: input,
          outputTokens: usage.output,
          totalTokens: usage.totalTokens || input + usage.output,
          cachedInputTokens: usage.cacheRead,
          cacheWriteTokens: usage.cacheWrite,
          reasoningTokens: usage.reasoning,
        }),
        modelCalls: (metrics.modelCalls || 0) + 1,
        largestInputTokens: Math.max(metrics.largestInputTokens || 0, input),
      };
      return metrics;
    },
  };
}

function addTokenUsage(
  total: TokenUsage | undefined,
  usage: TokenUsage | undefined,
): TokenUsage | undefined {
  if (!total) return usage;
  if (!usage) return total;
  return {
    inputTokens: add(total.inputTokens, usage.inputTokens),
    outputTokens: add(total.outputTokens, usage.outputTokens),
    totalTokens: add(total.totalTokens, usage.totalTokens),
    cachedInputTokens: add(total.cachedInputTokens, usage.cachedInputTokens),
    cacheWriteTokens: add(total.cacheWriteTokens, usage.cacheWriteTokens),
    reasoningTokens: add(total.reasoningTokens, usage.reasoningTokens),
    cost: add(total.cost, usage.cost),
  };
}

function add(a: number | undefined, b: number | undefined) {
  return a === undefined && b === undefined ? undefined : (a || 0) + (b || 0);
}

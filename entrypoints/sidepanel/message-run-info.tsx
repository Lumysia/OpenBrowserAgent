import { Info } from "lucide-react";
import { useState } from "react";
import {
  ESTIMATED_CHARS_PER_TOKEN,
  MS_PER_SECOND,
} from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import type {
  ChatMessage,
  RunMetrics,
  TokenUsage,
} from "../../src/shared/types";
import {
  Button,
  IconTooltip,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../src/ui/components";
import { formatCompactNumber, formatToolMessage } from "./format";

export function MessageRunInfo({
  t,
  message,
  chatMessages,
}: {
  t: Messages;
  message: ChatMessage;
  chatMessages: ChatMessage[];
}) {
  const current = readRunMetrics(message);
  const chat = aggregateRunMetrics(chatMessages);
  const [view, setView] = useState<"turn" | "chat">("turn");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span>
          <IconTooltip label={t.sidepanel.runInfo.title}>
            <Button
              variant="ghost"
              size="icon"
              className="copy-message"
              aria-label={t.sidepanel.runInfo.title}
            >
              <Info />
            </Button>
          </IconTooltip>
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="run-info-popover"
        align="end"
        side="top"
        sideOffset={8}
        collisionPadding={8}
      >
        <div className="run-info-header">
          <strong>{t.sidepanel.runInfo.title}</strong>
        </div>
        <Tabs
          value={view}
          onValueChange={(value) => setView(value as "turn" | "chat")}
          className="run-info-tabs"
        >
          <TabsList aria-label={t.sidepanel.runInfo.title}>
            <TabsTrigger value="turn">
              {t.sidepanel.runInfo.currentTurn}
            </TabsTrigger>
            <TabsTrigger value="chat">
              {t.sidepanel.runInfo.wholeChat}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="turn">
            <RunInfoSection
              title={t.sidepanel.runInfo.currentTurn}
              metrics={current}
              t={t}
            />
          </TabsContent>
          <TabsContent value="chat">
            <RunInfoSection
              title={t.sidepanel.runInfo.wholeChat}
              metrics={chat}
              t={t}
            />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

function RunInfoSection({
  title,
  metrics,
  t,
}: {
  title: string;
  metrics: RunMetrics;
  t: Messages;
}) {
  const usage = metrics.usage;
  return (
    <div className="run-info-section">
      <div className="run-info-section-title">{title}</div>
      <div className="run-info-metric-pair">
        <MetricRow
          label={t.sidepanel.runInfo.ttft}
          value={formatMs(ttft(metrics), t)}
        />
        <MetricRow
          label={t.sidepanel.runInfo.tps}
          value={formatTps(metrics, t)}
        />
      </div>
      <CacheShareBar usage={usage} t={t} />
      <div className="run-info-token-grid">
        <MetricRow
          label={t.sidepanel.runInfo.modelCalls}
          value={
            metrics.modelCalls === undefined
              ? t.sidepanel.runInfo.unavailable
              : String(metrics.modelCalls)
          }
        />
        <MetricRow
          label={t.sidepanel.runInfo.largestRequest}
          value={formatTokenCount(metrics.largestInputTokens, t)}
        />
        <MetricRow
          label={t.sidepanel.runInfo.input}
          value={formatTokenCount(usage?.inputTokens, t)}
        />
        <MetricRow
          label={t.sidepanel.runInfo.cached}
          value={formatTokenCount(usage?.cachedInputTokens, t)}
        />
        <MetricRow
          label={t.sidepanel.runInfo.cacheWrite}
          value={formatTokenCount(usage?.cacheWriteTokens, t)}
        />
        <MetricRow
          label={t.sidepanel.runInfo.outputTokens}
          value={formatTokenCount(usage?.outputTokens, t)}
        />
        <MetricRow
          label={t.sidepanel.runInfo.reasoning}
          value={formatTokenCount(usage?.reasoningTokens, t)}
        />
      </div>
    </div>
  );
}

// Share of input tokens the provider served from its prompt cache.
function CacheShareBar({
  usage,
  t,
}: {
  usage: TokenUsage | undefined;
  t: Messages;
}) {
  const input = usage?.inputTokens || 0;
  if (!input) return null;
  const cached = Math.min(input, usage?.cachedInputTokens || 0);
  const share = formatToolMessage(t.sidepanel.runInfo.cachedShare, {
    percent: Math.round((cached / input) * 100),
  });
  return (
    <div className="run-info-cache" title={share}>
      <span>{share}</span>
      <Progress
        aria-label={share}
        segments={[
          {
            key: "cached",
            value: cached,
            className: "run-info-cache-hit",
            tooltip: `${t.sidepanel.runInfo.cached}\n${formatTokenCount(cached, t)}`,
          },
          {
            key: "uncached",
            value: input - cached,
            className: "run-info-cache-miss",
            tooltip: `${t.sidepanel.runInfo.uncached}\n${formatTokenCount(input - cached, t)}`,
          },
        ]}
      />
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="run-info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function readRunMetrics(message: ChatMessage): RunMetrics {
  return ((message.metadata?.runMetrics || {}) as RunMetrics) || {};
}

function aggregateRunMetrics(messages: ChatMessage[]): RunMetrics {
  const runs = messages
    .filter((message) => message.role === "assistant")
    .map(readRunMetrics)
    .filter((metrics) => metrics.startedAt || metrics.usage);
  const usage = runs.reduce<TokenUsage>(
    (total, metrics) => addUsage(total, metrics.usage),
    {},
  );
  const generationMs = runs.reduce(
    (total, metrics) => total + generationDuration(metrics),
    0,
  );
  const firstStartedAt = Math.min(
    ...runs.map((metrics) => metrics.startedAt || Infinity),
  );
  const lastEndedAt = Math.max(...runs.map((metrics) => metrics.endedAt || 0));
  return {
    startedAt: Number.isFinite(firstStartedAt) ? firstStartedAt : undefined,
    firstTokenAt: averageTtftStart(runs),
    endedAt: lastEndedAt || undefined,
    usage,
    modelCalls: runs.reduce(
      (total, metrics) => total + (metrics.modelCalls || 0),
      0,
    ),
    largestInputTokens: Math.max(
      0,
      ...runs.map((metrics) => metrics.largestInputTokens || 0),
    ),
    outputCharacters: runs.reduce(
      (total, metrics) => total + (metrics.outputCharacters || 0),
      0,
    ),
    metadataGenerationMs: generationMs,
  } as RunMetrics & { metadataGenerationMs?: number };
}

function addUsage(
  total: TokenUsage,
  usage: TokenUsage | undefined,
): TokenUsage {
  return {
    inputTokens: add(total.inputTokens, usage?.inputTokens),
    outputTokens: add(total.outputTokens, usage?.outputTokens),
    totalTokens: add(total.totalTokens, usage?.totalTokens),
    cachedInputTokens: add(total.cachedInputTokens, usage?.cachedInputTokens),
    cacheWriteTokens: add(total.cacheWriteTokens, usage?.cacheWriteTokens),
    reasoningTokens: add(total.reasoningTokens, usage?.reasoningTokens),
    cost: add(total.cost, usage?.cost),
  };
}

function add(a: number | undefined, b: number | undefined) {
  return a === undefined && b === undefined ? undefined : (a || 0) + (b || 0);
}

function averageTtftStart(runs: RunMetrics[]) {
  const values = runs
    .map(ttft)
    .filter((value): value is number => value !== undefined);
  if (!values.length) return undefined;
  return (
    (runs[0]?.startedAt || 0) +
    values.reduce((sum, value) => sum + value, 0) / values.length
  );
}

function ttft(metrics: RunMetrics) {
  return metrics.startedAt && metrics.firstTokenAt
    ? metrics.firstTokenAt - metrics.startedAt
    : undefined;
}

function generationDuration(metrics: RunMetrics) {
  if (!metrics.firstTokenAt || !metrics.endedAt) return 0;
  return Math.max(0, metrics.endedAt - metrics.firstTokenAt);
}

function formatTps(metrics: RunMetrics, t: Messages) {
  const duration =
    (metrics as RunMetrics & { metadataGenerationMs?: number })
      .metadataGenerationMs || generationDuration(metrics);
  const outputTokens = metrics.usage?.outputTokens;
  if (!duration) return t.sidepanel.runInfo.unavailable;
  if (outputTokens)
    return `${(outputTokens / (duration / MS_PER_SECOND)).toFixed(1)}/s`;
  const estimatedTokens = estimateTokens(metrics.outputCharacters);
  if (!estimatedTokens) return t.sidepanel.runInfo.unavailable;
  return `${(estimatedTokens / (duration / MS_PER_SECOND)).toFixed(1)}/s ${t.sidepanel.runInfo.estimated}`;
}

function estimateTokens(characters: number | undefined) {
  if (!characters) return 0;
  return Math.max(1, Math.round(characters / ESTIMATED_CHARS_PER_TOKEN));
}

function formatMs(value: number | undefined, t: Messages) {
  if (value === undefined) return t.sidepanel.runInfo.unavailable;
  return value < MS_PER_SECOND
    ? `${Math.round(value)} ms`
    : `${(value / MS_PER_SECOND).toFixed(2)} s`;
}

function formatTokenCount(value: number | undefined, t: Messages) {
  if (value === undefined) return t.sidepanel.runInfo.unavailable;
  return `${formatCompactNumber(value)} ${t.sidepanel.runInfo.tokenUnit}`;
}

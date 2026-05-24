import { Info } from "lucide-react";
import { useState } from "react";
import {
  ESTIMATED_CHARS_PER_TOKEN,
  MS_PER_SECOND,
} from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import { PROMPT_BREAKDOWN_SEGMENT } from "../../src/shared/prompt-breakdown";
import type {
  ChatMessage,
  ContextBudgetReport,
  PromptBreakdown,
  RunMetrics,
  TokenUsage,
} from "../../src/shared/types";
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../src/ui/components";
import { formatCompactNumber, formatEstimatedTokens } from "./format";
import { IconTooltip } from "./icon-tooltip";

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
          <Badge>{modeLabel(t, current.outputMode)}</Badge>
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
      <PromptBreakdownBar breakdown={metrics.promptBreakdown} t={t} />
      <div className="run-info-token-grid">
        <MetricRow
          label={t.sidepanel.runInfo.input}
          value={formatTokenCount(metrics.usage?.inputTokens, t)}
        />
        <MetricRow
          label={t.sidepanel.runInfo.outputTokens}
          value={formatTokenCount(metrics.usage?.outputTokens, t)}
        />
        <MetricRow
          label={t.sidepanel.runInfo.cached}
          value={formatTokenCount(metrics.usage?.cachedInputTokens, t)}
        />
        <MetricRow
          label={t.sidepanel.runInfo.cacheWrite}
          value={formatTokenCount(metrics.usage?.cacheWriteTokens, t)}
        />
        <MetricRow
          label={t.sidepanel.runInfo.total}
          value={formatTokenCount(metrics.usage?.totalTokens, t)}
        />
        <MetricRow
          label={t.sidepanel.runInfo.reasoning}
          value={formatTokenCount(metrics.usage?.reasoningTokens, t)}
        />
      </div>
    </div>
  );
}

function PromptBreakdownBar({
  breakdown,
  t,
}: {
  breakdown: PromptBreakdown | undefined;
  t: Messages;
}) {
  const segments = promptSegments(breakdown, t);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (!total) return null;
  return (
    <div className="run-info-prompt">
      <Progress
        aria-label={t.sidepanel.runInfo.promptBreakdown}
        segments={segments.map((segment) => ({
          key: segment.key,
          value: segment.value,
          className: `run-info-prompt-${segment.key}`,
          tooltip: `${segment.label}\n${formatEstimatedTokens(segment.value, t)}`,
        }))}
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
    outputMode: aggregateMode(runs),
    usage,
    promptBreakdown: runs.reduce<PromptBreakdown>(
      (total, metrics) => addPromptBreakdown(total, metrics.promptBreakdown),
      {},
    ),
    contextBudget: runs.reduce<ContextBudgetReport>(
      (total, metrics) => addContextBudget(total, metrics.contextBudget),
      {} as ContextBudgetReport,
    ),
    outputCharacters: runs.reduce(
      (total, metrics) => total + (metrics.outputCharacters || 0),
      0,
    ),
    metadataGenerationMs: generationMs,
  } as RunMetrics & { metadataGenerationMs?: number };
}

function addContextBudget(
  total: ContextBudgetReport,
  budget: ContextBudgetReport | undefined,
): ContextBudgetReport {
  return {
    originalChars: add(total.originalChars, budget?.originalChars) || 0,
    finalChars: add(total.finalChars, budget?.finalChars) || 0,
    prunedChars: add(total.prunedChars, budget?.prunedChars) || 0,
    prunedMessages: add(total.prunedMessages, budget?.prunedMessages) || 0,
    truncatedToolResults:
      add(total.truncatedToolResults, budget?.truncatedToolResults) || 0,
    compactionSummary: budget?.compactionSummary || total.compactionSummary,
  };
}

function addPromptBreakdown(
  total: PromptBreakdown,
  breakdown: PromptBreakdown | undefined,
): PromptBreakdown {
  return {
    systemPromptChars: add(
      total.systemPromptChars,
      breakdown?.systemPromptChars,
    ),
    userPromptChars: add(total.userPromptChars, breakdown?.userPromptChars),
    conversationPromptChars: add(
      total.conversationPromptChars,
      breakdown?.conversationPromptChars,
    ),
    tabPromptChars: add(total.tabPromptChars, breakdown?.tabPromptChars),
    selectedElementPromptChars: add(
      total.selectedElementPromptChars,
      breakdown?.selectedElementPromptChars,
    ),
    skillPromptChars: add(total.skillPromptChars, breakdown?.skillPromptChars),
    attachmentPromptChars: add(
      total.attachmentPromptChars,
      breakdown?.attachmentPromptChars,
    ),
    toolCallPromptChars: add(
      total.toolCallPromptChars,
      breakdown?.toolCallPromptChars,
    ),
    sourcePromptChars: add(
      total.sourcePromptChars,
      breakdown?.sourcePromptChars,
    ),
    otherContextPromptChars: add(
      total.otherContextPromptChars,
      breakdown?.otherContextPromptChars,
    ),
  };
}

function promptSegments(breakdown: PromptBreakdown | undefined, t: Messages) {
  const values = [
    {
      key: PROMPT_BREAKDOWN_SEGMENT.system,
      label: t.sidepanel.runInfo.prebuiltPrompt,
      value: breakdown?.systemPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.user,
      label: t.sidepanel.runInfo.userPrompt,
      value: breakdown?.userPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.conversation,
      label: t.sidepanel.runInfo.conversationPrompt,
      value: breakdown?.conversationPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.tabs,
      label: t.sidepanel.runInfo.tabPrompt,
      value: breakdown?.tabPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.element,
      label: t.sidepanel.runInfo.selectedElementPrompt,
      value: breakdown?.selectedElementPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.skills,
      label: t.sidepanel.runInfo.skillPrompt,
      value: breakdown?.skillPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.attachments,
      label: t.sidepanel.runInfo.attachmentPrompt,
      value: breakdown?.attachmentPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.tools,
      label: t.sidepanel.runInfo.toolCallPrompt,
      value: breakdown?.toolCallPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.sources,
      label: t.sidepanel.runInfo.sourcePrompt,
      value: breakdown?.sourcePromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.other,
      label: t.sidepanel.runInfo.otherPrompt,
      value: breakdown?.otherContextPromptChars || 0,
    },
  ];
  return values.filter((segment) => segment.value > 0);
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

function aggregateMode(
  runs: RunMetrics[],
): RunMetrics["outputMode"] | "mixed" | undefined {
  const modes = new Set(
    runs.map((metrics) => metrics.outputMode).filter(Boolean),
  );
  if (modes.size > 1) return "mixed" as RunMetrics["outputMode"];
  return modes.values().next().value;
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

function formatNumber(value: number | undefined, t: Messages) {
  return value === undefined
    ? t.sidepanel.runInfo.unavailable
    : value.toLocaleString();
}

function modeLabel(
  t: Messages,
  mode: RunMetrics["outputMode"] | "mixed" | undefined,
) {
  if (mode === "streaming") return t.sidepanel.runInfo.streaming;
  if (mode === "buffered") return t.sidepanel.runInfo.buffered;
  if (mode === "mixed") return t.sidepanel.runInfo.mixed;
  return t.sidepanel.runInfo.unavailable;
}

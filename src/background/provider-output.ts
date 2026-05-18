import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import {
  assignChatSources,
  extractSourcesFromTool,
} from "../shared/chat-sources";
import type { ChatMessage, ChatSource } from "../shared/types";
import type { TokenUsage } from "../shared/types";

export type VisionImage = { dataUrl: string; type?: string };

export function attachToolSources(
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
  currentSources: ChatSource[],
) {
  if (!output || typeof output !== "object") return output;
  const record = output as Record<string, unknown>;
  const extracted = extractSourcesFromTool(toolName, input, record);
  if (toolName === BROWSER_TOOL_NAME.groupTabs && currentSources.length)
    return { ...record, _sources: currentSources };
  if (!extracted.length) return output;
  const { added } = assignChatSources(currentSources, extracted);
  return added.length ? { ...record, _sources: added } : output;
}

export function mergeOutputSources(current: ChatSource[], output: unknown) {
  if (!output || typeof output !== "object") return current;
  const sources = (output as Record<string, unknown>)._sources;
  return Array.isArray(sources)
    ? assignChatSources(current, sources as ChatSource[]).sources
    : current;
}

export function extractVisionImage(output: unknown): VisionImage | undefined {
  if (!output || typeof output !== "object") return undefined;
  const image = (output as { _visionImage?: unknown })._visionImage;
  if (!image || typeof image !== "object") return undefined;
  const dataUrl = (image as { dataUrl?: unknown }).dataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/"))
    return undefined;
  const type = (image as { type?: unknown }).type;
  return { dataUrl, type: typeof type === "string" ? type : undefined };
}

export function sanitizeToolOutput(output: unknown) {
  if (!output || typeof output !== "object") return output;
  const { _visionImage, ...rest } = output as Record<string, unknown>;
  return _visionImage ? { ...rest, visionImageAttached: true } : output;
}

export function base64FromDataUrl(dataUrl: string) {
  return dataUrl.includes(",") ? dataUrl.split(",", 2)[1] || "" : dataUrl;
}

export function getMessageSources(messages: ChatMessage[]): ChatSource[] {
  const latest = messages[messages.length - 1];
  return Array.isArray(latest?.metadata?.sources)
    ? (latest.metadata.sources as ChatSource[])
    : [];
}

export function geminiText(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}) {
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || ""
  );
}

export function normalizeGeminiUsage(usage?: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
}): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
    totalTokens: usage.totalTokenCount,
    cachedInputTokens: usage.cachedContentTokenCount,
  };
}

export function addTokenUsage(
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

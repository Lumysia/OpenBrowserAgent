import { errorMessage } from "../../shared/error-message";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { estimateMessageTokens } from "@earendil-works/pi-ai/utils/estimate";
import { ESTIMATED_IMAGE_CHARS } from "../../shared/config";
import type { ArtifactStore } from "../../shared/artifacts";
import {
  buildCompactionPrompt,
  COMPACTION_SYSTEM_PROMPT,
  renderTranscript,
  summaryMessage,
} from "./compaction";
import { CONTEXT_POLICY, tokenChars, windowShare } from "./policy";
import { createToolOutputs } from "./tool-outputs";

export type ContextEngineOptions = {
  chatId: string;
  store: ArtifactStore;
  contextWindow?: number;
  // Window of the model that summarizes (the helper model).
  summarizerWindow?: number;
  // One plain-text model request; the runtime picks the helper model.
  summarize: (
    system: string,
    prompt: string,
    signal?: AbortSignal,
  ) => Promise<string>;
  onCompacted?: (summary: string) => void;
  onCompactionFailed?: (error: string) => void;
  // Tools whose long arguments (such as translated text) shrink once old.
  compactArgs?: (toolName: string) => boolean;
};

export const DROPPED_IMAGE =
  "[An earlier image was removed to save context; take a new screenshot if you need it.]";

// Owns what the model sees of one run. The agent transcript itself stays
// complete; `transform` derives each request from it. Every step is sticky
// (a masked output stays masked, a summary stays in place) so consecutive
// requests share the longest possible prefix.
export function createContextEngine(options: ContextEngineOptions) {
  const { chatId, store } = options;
  const window = options.contextWindow || CONTEXT_POLICY.defaultContextWindow;
  const transcriptChars = tokenChars(
    Math.min(window, options.summarizerWindow || window) *
      CONTEXT_POLICY.helperInputRatio,
  );
  const outputs = createToolOutputs(chatId, store);
  const masks = new Map<string, string>();
  type ToolCallArguments = Extract<
    Extract<AgentMessage, { role: "assistant" }>["content"][number],
    { type: "toolCall" }
  >["arguments"];
  const argMasks = new Map<string, ToolCallArguments>();
  let compaction: { summary: string; covered: number } | undefined;
  let retryCompactionAbove = 0;

  function view(messages: AgentMessage[]): AgentMessage[] {
    // Images of the latest tool batch stay; older ones are dropped.
    const latestBatch = messages.findLastIndex(
      (message) => message.role === "assistant",
    );
    const masked = messages.map((message, index): AgentMessage => {
      if (message.role === "assistant" && argMasks.size)
        return message.content.some(
          (part) => part.type === "toolCall" && argMasks.has(part.id),
        )
          ? {
              ...message,
              content: message.content.map((part) =>
                part.type === "toolCall" && argMasks.has(part.id)
                  ? { ...part, arguments: argMasks.get(part.id)! }
                  : part,
              ),
            }
          : message;
      if (message.role !== "toolResult") return message;
      const stub = masks.get(message.toolCallId);
      if (stub)
        return { ...message, content: [{ type: "text" as const, text: stub }] };
      if (
        index < latestBatch &&
        message.content.some((part) => part.type === "image")
      )
        return {
          ...message,
          content: [
            ...message.content.filter((part) => part.type !== "image"),
            { type: "text" as const, text: DROPPED_IMAGE },
          ],
        };
      return message;
    });
    if (!compaction) return masked;
    const covered = masked.slice(0, compaction.covered);
    const tail = masked.slice(compaction.covered);
    const task = tail.some((message) => message.role === "user")
      ? []
      : covered.filter((message) => message.role === "user").slice(-1);
    return [
      ...covered.filter((message) => message.role === "system"),
      summaryMessage(compaction.summary),
      ...task,
      ...tail,
    ];
  }

  // Masks older outputs in one batch once enough of them can go. The newest
  // outputs and the latest tool batch are never masked.
  async function mask(messages: AgentMessage[]) {
    const protect = windowShare(window, CONTEXT_POLICY.protectRecentToolTokens);
    const batch = windowShare(window, CONTEXT_POLICY.maskBatchTokens);
    const latestBatch = messages.findLastIndex(
      (message) => message.role === "assistant",
    );
    const candidates: Extract<AgentMessage, { role: "toolResult" }>[] = [];
    const oldCalls = new Set<string>();
    const argCandidates: Array<{ id: string; args: ToolCallArguments }> = [];
    let recent = 0;
    let maskable = 0;
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (message.role === "assistant" && index < latestBatch)
        for (const part of message.content) {
          if (
            part.type !== "toolCall" ||
            !oldCalls.has(part.id) ||
            argMasks.has(part.id) ||
            !options.compactArgs?.(part.name)
          )
            continue;
          const chars = JSON.stringify(part.arguments).length;
          if (chars < CONTEXT_POLICY.minMaskChars) continue;
          argCandidates.push({ id: part.id, args: part.arguments });
          maskable += Math.ceil(chars / 4);
        }
      if (message.role !== "toolResult") continue;
      const tokens = estimateMessageTokens(message);
      recent += tokens;
      if (index > latestBatch || recent <= protect) continue;
      if (index < (compaction?.covered || 0)) break;
      // Results of earlier turns arrive shortened (see history.ts).
      if (!outputs.has(message.toolCallId)) continue;
      oldCalls.add(message.toolCallId);
      if (masks.has(message.toolCallId)) continue;
      if (contentChars(message) < CONTEXT_POLICY.minMaskChars) continue;
      candidates.push(message);
      maskable += tokens;
    }
    if (maskable < batch) return;
    for (const { id, args } of argCandidates)
      argMasks.set(id, shrinkArguments(args) as ToolCallArguments);
    for (const message of candidates) {
      const handle = await outputs.persist(message.toolCallId);
      if (!handle) continue;
      masks.set(
        message.toolCallId,
        `[Older output masked to save context: ${outputs.label(message.toolCallId)}. ${contentChars(message)} characters; the full output is "${handle}" (use read).]`,
      );
    }
  }

  async function compact(messages: AgentMessage[], signal?: AbortSignal) {
    const start =
      compaction?.covered ??
      messages.findIndex((message) => message.role !== "system");
    const keep = windowShare(window, CONTEXT_POLICY.keepRecentTokens);
    const masked = view(messages);
    const offset = masked.length - messages.length;
    let cut = -1;
    let tail = 0;
    for (let index = messages.length - 1; index > start; index--) {
      tail += estimateMessageTokens(masked[index + offset] as Message);
      const message = messages[index];
      if (message.role !== "user" && message.role !== "assistant") continue;
      if (tail > keep && cut >= 0) break;
      cut = index;
    }
    if (cut <= start) return;
    const region = view(messages.slice(0, cut)).filter(
      (message) => message.role !== "system",
    );
    const summary = (
      await options.summarize(
        COMPACTION_SYSTEM_PROMPT,
        buildCompactionPrompt(
          renderTranscript(region, transcriptChars),
          compaction?.summary,
        ),
        signal,
      )
    ).trim();
    if (!summary) throw new Error("Empty compaction summary");
    compaction = { summary, covered: cut };
    options.onCompacted?.(summary);
  }

  return {
    acceptToolOutput: outputs.accept,
    storeText: outputs.store,
    async transform(messages: AgentMessage[], signal?: AbortSignal) {
      await mask(messages);
      let next = view(messages);
      const tokens = estimateTokens(next);
      if (
        tokens > window * CONTEXT_POLICY.compactAtRatio &&
        tokens > retryCompactionAbove
      ) {
        try {
          await compact(messages, signal);
          next = view(messages);
        } catch (error) {
          if (signal?.aborted) throw error;
          options.onCompactionFailed?.(errorMessage(error));
          // Retry once the transcript has grown noticeably.
          retryCompactionAbove =
            tokens + windowShare(window, CONTEXT_POLICY.keepRecentTokens);
        }
      }
      return next;
    },
  };
}

function estimateTokens(messages: AgentMessage[]) {
  return messages.reduce(
    (sum, message) => sum + estimateMessageTokens(message as Message),
    0,
  );
}

function contentChars(message: Extract<AgentMessage, { role: "toolResult" }>) {
  return message.content.reduce(
    (sum, part) =>
      sum + (part.type === "text" ? part.text.length : ESTIMATED_IMAGE_CHARS),
    0,
  );
}

// Long strings of an old call's arguments, replaced by their length: the
// call already ran and its effect is on the page.
export function shrinkArguments(value: unknown): unknown {
  if (typeof value === "string")
    return value.length > 120
      ? `${value.slice(0, 40)}… [${value.length} chars, already applied]`
      : value;
  if (Array.isArray(value)) return value.map(shrinkArguments);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, shrinkArguments(item)]),
    );
  return value;
}

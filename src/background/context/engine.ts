import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { estimateMessageTokens } from "@earendil-works/pi-ai/utils/estimate";
import type { ArtifactStore } from "../../shared/artifacts";
import {
  buildCompactionPrompt,
  COMPACTION_SYSTEM_PROMPT,
  renderTranscript,
  summaryMessage,
} from "./compaction";
import { CONTEXT_POLICY, windowShare } from "./policy";
import { createToolOutputs, readArtifact } from "./tool-outputs";

export type ContextEngineOptions = {
  chatId: string;
  store: ArtifactStore;
  contextWindow?: number;
  // One plain-text model request; the runtime picks the helper model.
  summarize: (
    system: string,
    prompt: string,
    signal?: AbortSignal,
  ) => Promise<string>;
  onCompacted?: (summary: string) => void;
};

// Owns what the model sees of one run. The agent transcript itself stays
// complete; `transform` derives each request from it. Every step is sticky
// (a masked output stays masked, a summary stays in place) so consecutive
// requests share the longest possible prefix.
export function createContextEngine(options: ContextEngineOptions) {
  const { chatId, store } = options;
  const window = options.contextWindow || CONTEXT_POLICY.defaultContextWindow;
  const outputs = createToolOutputs(chatId, store);
  const masks = new Map<string, string>();
  let compaction: { summary: string; covered: number } | undefined;
  let retryCompactionAbove = 0;

  function view(messages: AgentMessage[]): AgentMessage[] {
    const masked = messages.map((message) => {
      const stub =
        message.role === "toolResult"
          ? masks.get(message.toolCallId)
          : undefined;
      return stub
        ? { ...message, content: [{ type: "text" as const, text: stub }] }
        : message;
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
    let recent = 0;
    let maskable = 0;
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (message.role !== "toolResult") continue;
      const tokens = estimateMessageTokens(message);
      recent += tokens;
      if (index > latestBatch || recent <= protect) continue;
      if (index < (compaction?.covered || 0)) break;
      if (masks.has(message.toolCallId)) continue;
      if (contentChars(message) < CONTEXT_POLICY.minMaskChars) continue;
      candidates.push(message);
      maskable += tokens;
    }
    if (maskable < batch) return;
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
          renderTranscript(region, Math.floor(window * 0.5 * 3.5)),
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
    read: (input: Record<string, unknown>) =>
      readArtifact(store, chatId, input),
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
    (sum, part) => sum + (part.type === "text" ? part.text.length : 4_800),
    0,
  );
}

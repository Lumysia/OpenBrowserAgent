import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { TokenUsage } from "../shared/types";
import { CHAT_PART_STATE, toolPartType } from "../shared/types";
import { post } from "./message-helpers";
import { addTokenUsage } from "./provider-output";
import { isQueuedMessage, type QueuedUserMessage } from "./pi-session";

export function createPiEventHandler(
  port: chrome.runtime.Port,
  initialMessageId?: string,
) {
  let assistantId = initialMessageId || crypto.randomUUID();
  let turnId = crypto.randomUUID();
  let usage: TokenUsage | undefined;
  const openParts = new Map<string, "text" | "reasoning">();
  const consumed: QueuedUserMessage[] = [];
  return {
    get messageId() {
      return assistantId;
    },
    get usage() {
      return usage;
    },
    acknowledgeConsumedMessages() {
      if (!consumed.length) return;
      const createdAt = Date.now();
      const batch = consumed.splice(0);
      assistantId = crypto.randomUUID();
      post(port, {
        type: "queuedMessages",
        messages: batch.map((message, index) => ({
          id: message.queueId,
          content: String(message.content),
          createdAt: createdAt + index,
        })),
        assistantMessageId: assistantId,
        createdAt: createdAt + batch.length,
      });
    },
    handle(event: AgentEvent) {
      if (event.type === "message_start") {
        if (isQueuedMessage(event.message)) consumed.push(event.message);
        if (event.message.role === "assistant") turnId = crypto.randomUUID();
      }
      if (event.type === "message_update") {
        const update = event.assistantMessageEvent;
        if (!("contentIndex" in update)) return;
        if (
          update.type === "toolcall_start" ||
          update.type === "toolcall_delta" ||
          update.type === "toolcall_end"
        ) {
          const call = update.partial.content[update.contentIndex];
          if (call?.type === "toolCall" && call.id && call.name) {
            post(port, {
              type: "chunk",
              chunk: {
                type: toolPartType(call.name),
                toolCallId: call.id,
                toolName: call.name,
                state: CHAT_PART_STATE.inputStreaming,
                // Snapshot mutable provider progress for session replay. Only
                // Pi's validated execute() path announces input-available.
                input: structuredClone(call.arguments),
              },
            });
          }
          return;
        }
        const id = `${turnId}:${update.contentIndex}`;
        const kind = update.type.startsWith("thinking_") ? "reasoning" : "text";
        if (update.type === "text_start" || update.type === "thinking_start") {
          openParts.set(id, kind);
          post(port, { type: "chunk", chunk: { type: `${kind}-start`, id } });
        } else if (
          update.type === "text_delta" ||
          update.type === "thinking_delta"
        ) {
          post(port, {
            type: "chunk",
            chunk: { type: `${kind}-delta`, id, delta: update.delta },
          });
        } else if (
          update.type === "text_end" ||
          update.type === "thinking_end"
        ) {
          openParts.delete(id);
          post(port, { type: "chunk", chunk: { type: `${kind}-end`, id } });
        }
      }
      if (
        event.type === "tool_execution_end" &&
        event.isError &&
        !event.result.details?.output
      ) {
        // Includes Pi validation/unknown-tool errors, which never reach execute().
        post(port, {
          type: "chunk",
          chunk: {
            type: toolPartType(event.toolName),
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            state: "output-error",
            output: event.result.details?.output ?? {
              error: event.result.content
                ?.map((part: { text?: string }) => part.text || "")
                .join("\n"),
            },
          },
        });
      }
      if (event.type === "message_end" && event.message.role === "assistant") {
        for (const [id, kind] of openParts)
          post(port, { type: "chunk", chunk: { type: `${kind}-end`, id } });
        openParts.clear();
        const current = event.message.usage;
        usage = addTokenUsage(usage, {
          inputTokens: current.input + current.cacheRead + current.cacheWrite,
          outputTokens: current.output,
          totalTokens: current.totalTokens,
          cachedInputTokens: current.cacheRead,
          cacheWriteTokens: current.cacheWrite,
          reasoningTokens: current.reasoning,
        });
      }
    },
  };
}

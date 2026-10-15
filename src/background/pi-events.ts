import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type {
  AssistantMessageEvent,
  StopReason,
  Usage,
} from "@earendil-works/pi-ai";
import {
  AI_TEXT_CHUNK_TYPE,
  CHAT_PART_STATE,
  toolPartType,
  type AiStreamResponse,
} from "../shared/types";
import { RUN_STOP_REASON, type RunStopReason } from "../shared/run-stop";
import { createUsageMeter, type UsageMetrics } from "./run-usage";
import { isQueuedMessage, type QueuedUserMessage } from "./stream-sessions";

const TEXT_CHUNKS = {
  text: {
    start: AI_TEXT_CHUNK_TYPE.textStart,
    delta: AI_TEXT_CHUNK_TYPE.textDelta,
    end: AI_TEXT_CHUNK_TYPE.textEnd,
  },
  // Reasoning renders as a text note in the sidepanel.
  thinking: {
    start: AI_TEXT_CHUNK_TYPE.textNoteStart,
    delta: AI_TEXT_CHUNK_TYPE.textNoteDelta,
    end: AI_TEXT_CHUNK_TYPE.textNoteEnd,
  },
};

// How each of Pi's stop reasons ends a reply. A tool call step is finished;
// the run goes on with the next step, whose own end then counts.
const STOP_REASONS: Partial<Record<StopReason, RunStopReason>> = {
  stop: RUN_STOP_REASON.finished,
  toolUse: RUN_STOP_REASON.finished,
  length: RUN_STOP_REASON.length,
  aborted: RUN_STOP_REASON.aborted,
  error: RUN_STOP_REASON.error,
};

type EventHandlers = {
  [K in AgentEvent["type"]]?: (event: Extract<AgentEvent, { type: K }>) => void;
};

// A streamed change to one block of the reply's content.
type ContentUpdate = Extract<AssistantMessageEvent, { contentIndex: number }>;

// Translates Pi events into the sidepanel stream protocol.
export function createEventHandler(
  post: (message: AiStreamResponse) => void,
  initialMessageId?: string,
) {
  let assistantId = initialMessageId || crypto.randomUUID();
  let turnId = crypto.randomUUID();
  const meter = createUsageMeter();
  // Model requests sent and not yet answered. Pi also reports the prompt's
  // replayed history and a run failure as assistant messages; those are no
  // requests and carry no usage.
  let pendingRequests = 0;
  const recordUsage = (usage: Usage, stopReason?: RunStopReason) =>
    post({
      type: "metrics",
      metrics: {
        ...meter.record(usage),
        ...(stopReason ? { stopReason } : {}),
      },
    });
  const addUsage = (metrics: UsageMetrics) =>
    post({ type: "metrics", metrics: meter.add(metrics) });
  const openParts = new Map<string, string>();
  const announcedCalls = new Set<string>();
  const consumed: QueuedUserMessage[] = [];
  const chunk = (value: Record<string, unknown>) =>
    post({ type: "chunk", chunk: value });

  // Announce each call once. Argument snapshots per delta would pile up in
  // the replay buffer; execute() sends the validated input.
  const announceToolCall = (update: ContentUpdate) => {
    const call = update.partial.content[update.contentIndex];
    if (call?.type !== "toolCall" || !call.id || !call.name) return;
    if (announcedCalls.has(call.id)) return;
    announcedCalls.add(call.id);
    chunk({
      type: toolPartType(call.name),
      toolCallId: call.id,
      toolName: call.name,
      state: CHAT_PART_STATE.inputStreaming,
      step: turnId,
    });
  };

  const textChunk = (update: ContentUpdate) => {
    const id = `${turnId}:${update.contentIndex}`;
    const [kind, phase] = update.type.split("_") as [
      keyof typeof TEXT_CHUNKS,
      string,
    ];
    const types = TEXT_CHUNKS[kind];
    if (!types) return;
    if (phase === "start") {
      openParts.set(id, types.end);
      chunk({ type: types.start, id });
    } else if (phase === "delta" && "delta" in update) {
      chunk({ type: types.delta, id, delta: update.delta });
    } else if (phase === "end") {
      openParts.delete(id);
      chunk({ type: types.end, id });
    }
  };

  const handlers: EventHandlers = {
    message_start(event) {
      if (isQueuedMessage(event.message)) consumed.push(event.message);
      if (event.message.role === "assistant") turnId = crypto.randomUUID();
    },
    message_update(event) {
      const update = event.assistantMessageEvent;
      if (!("contentIndex" in update)) return;
      if (update.type.startsWith("toolcall_")) announceToolCall(update);
      else textChunk(update);
    },
    tool_execution_end(event) {
      // Pi validation and unknown-tool errors never reach execute().
      if (!event.isError || event.result.details?.output) return;
      const error = (event.result.content || [])
        .map((part: { text?: string }) => part.text || "")
        .join("\n");
      chunk({
        type: toolPartType(event.toolName),
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        state: CHAT_PART_STATE.outputError,
        output: { error },
        result: { text: error },
      });
    },
    message_end(event) {
      if (event.message.role !== "assistant") return;
      // A stream that fails mid-part never sends its end event.
      for (const [id, type] of openParts) chunk({ type, id });
      openParts.clear();
      const stopReason = STOP_REASONS[event.message.stopReason];
      if (pendingRequests > 0) {
        pendingRequests--;
        recordUsage(event.message.usage, stopReason);
      } else if (stopReason && stopReason !== RUN_STOP_REASON.finished)
        post({ type: "metrics", metrics: { stopReason } });
    },
  };

  return {
    get messageId() {
      return assistantId;
    },
    recordUsage,
    addUsage,
    requestStarted() {
      pendingRequests++;
    },
    acknowledgeConsumedMessages() {
      if (!consumed.length) return;
      const createdAt = Date.now();
      const batch = consumed.splice(0);
      assistantId = crypto.randomUUID();
      meter.reset();
      post({
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
      const handler = handlers[event.type] as
        ((event: AgentEvent) => void) | undefined;
      handler?.(event);
    },
  };
}

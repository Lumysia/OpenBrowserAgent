import {
  AI_TEXT_CHUNK_TYPE,
  CHAT_PART_STATE,
  toolPartType,
  type AiStreamResponse,
  type TokenUsage,
} from "../shared/types";
import { STREAM_RENDER_THROTTLE_MS } from "../shared/config";

export type OpenAIResponsesFunctionCall = {
  id?: string;
  call_id: string;
  name?: string;
  arguments?: string;
  type: "function_call";
};

type FunctionCallDraft = OpenAIResponsesFunctionCall & { arguments: string };

export async function readOpenAIResponsesStream(
  response: Response,
  port: chrome.runtime.Port,
  signal: AbortSignal,
  preferredTextId?: string,
) {
  if (!response.body) throw new Error("Streaming response body is empty");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const functionCalls: FunctionCallDraft[] = [];
  const announcedCallIds = new Set<string>();
  const textId = preferredTextId || crypto.randomUUID();
  const reasoningId = `${textId}-reasoning`;
  let buffer = "";
  let content = "";
  let reasoning = "";
  let reasoningBuffer = "";
  let usage: TokenUsage | undefined;
  let textStarted = false;
  let reasoningStarted = false;
  let reasoningFlushTimeout: ReturnType<typeof setTimeout> | undefined;

  function emitText(delta: string) {
    if (!delta) return;
    if (!textStarted) {
      textStarted = true;
      post(port, {
        type: "chunk",
        chunk: { type: AI_TEXT_CHUNK_TYPE.textStart, id: textId },
      });
    }
    content += delta;
    post(port, {
      type: "chunk",
      chunk: { type: AI_TEXT_CHUNK_TYPE.textDelta, id: textId, delta },
    });
  }

  function emitReasoning(delta: string) {
    if (!delta) return;
    reasoning += delta;
    reasoningBuffer += delta;
    if (!reasoningStarted) {
      reasoningStarted = true;
      post(port, {
        type: "chunk",
        chunk: { type: AI_TEXT_CHUNK_TYPE.textNoteStart, id: reasoningId },
      });
    }
    if (reasoningFlushTimeout) return;
    reasoningFlushTimeout = setTimeout(
      flushReasoning,
      STREAM_RENDER_THROTTLE_MS,
    );
  }

  function flushReasoning() {
    if (reasoningFlushTimeout) clearTimeout(reasoningFlushTimeout);
    reasoningFlushTimeout = undefined;
    const delta = reasoningBuffer;
    reasoningBuffer = "";
    if (!delta) return;
    post(port, {
      type: "chunk",
      chunk: { type: AI_TEXT_CHUNK_TYPE.textNoteDelta, id: reasoningId, delta },
    });
  }

  function announceCall(call: FunctionCallDraft) {
    if (!call.call_id || !call.name || announcedCallIds.has(call.call_id))
      return;
    announcedCallIds.add(call.call_id);
    post(port, {
      type: "chunk",
      chunk: {
        type: toolPartType(call.name),
        toolCallId: call.call_id,
        toolName: call.name,
        state: CHAT_PART_STATE.inputStreaming,
        input: {},
      },
    });
  }

  function upsertFunctionCall(
    index: number,
    patch: Partial<OpenAIResponsesFunctionCall>,
  ) {
    const current = functionCalls[index] || {
      type: "function_call" as const,
      call_id: "",
      arguments: "",
    };
    functionCalls[index] = { ...current, ...patch };
    announceCall(functionCalls[index]);
    return functionCalls[index];
  }

  async function consumeEvent(rawEvent: string) {
    const data = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;

    const event = JSON.parse(data) as Record<string, unknown>;
    const type = String(event.type || "");
    if (type === "response.output_text.delta")
      emitText(optionalString(event.delta));
    if (
      type === "response.reasoning_text.delta" ||
      type === "response.reasoning_summary_text.delta"
    )
      emitReasoning(optionalString(event.delta));
    if (type === "response.completed") {
      const response = objectValue(event.response);
      usage = normalizeResponsesUsage(objectValue(response?.usage));
    }

    if (type === "response.output_item.added") {
      const item = objectValue(event.item);
      if (item?.type === "function_call")
        upsertFunctionCall(
          numberValue(event.output_index),
          functionCallPatch(item),
        );
    }
    if (type === "response.function_call_arguments.delta") {
      const index = numberValue(event.output_index);
      const call = upsertFunctionCall(index, {});
      call.arguments += optionalString(event.delta);
      announceCall(call);
    }
    if (type === "response.function_call_arguments.done") {
      const item = objectValue(event.item);
      const index = numberValue(event.output_index);
      upsertFunctionCall(index, {
        ...functionCallPatch(item),
        arguments:
          optionalString(event.arguments) || optionalString(item?.arguments),
      });
    }
    if (type === "response.output_item.done") {
      const item = objectValue(event.item);
      if (item?.type === "function_call")
        upsertFunctionCall(
          numberValue(event.output_index),
          functionCallPatch(item),
        );
    }
  }

  while (true) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const event of events) await consumeEvent(event);
  }

  buffer += decoder.decode();
  if (buffer.trim()) await consumeEvent(buffer);
  flushReasoning();
  if (textStarted)
    post(port, {
      type: "chunk",
      chunk: { type: AI_TEXT_CHUNK_TYPE.textEnd, id: textId },
    });
  if (reasoningStarted)
    post(port, {
      type: "chunk",
      chunk: { type: AI_TEXT_CHUNK_TYPE.textNoteEnd, id: reasoningId },
    });

  return {
    content,
    reasoning,
    functionCalls: functionCalls.filter((call) => call.call_id && call.name),
    usage,
  };
}

function functionCallPatch(
  item: Record<string, unknown> | undefined,
): Partial<OpenAIResponsesFunctionCall> {
  if (!item) return {};
  return {
    type: "function_call",
    id: optionalString(item.id) || undefined,
    call_id: optionalString(item.call_id),
    name: optionalString(item.name) || undefined,
    arguments: optionalString(item.arguments),
  };
}

function normalizeResponsesUsage(
  usage: Record<string, unknown> | undefined,
): TokenUsage | undefined {
  if (!usage) return undefined;
  const inputDetails = objectValue(usage.input_tokens_details);
  const outputDetails = objectValue(usage.output_tokens_details);
  return {
    inputTokens: numberOrUndefined(usage.input_tokens),
    outputTokens: numberOrUndefined(usage.output_tokens),
    totalTokens: numberOrUndefined(usage.total_tokens),
    cachedInputTokens: numberOrUndefined(inputDetails?.cached_tokens),
    reasoningTokens: numberOrUndefined(outputDetails?.reasoning_tokens),
  };
}

function objectValue(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function post(port: chrome.runtime.Port, message: AiStreamResponse) {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post ai-stream message", error);
  }
}

import {
  AI_TEXT_CHUNK_TYPE,
  CHAT_PART_STATE,
  toolPartType,
  type AiStreamResponse,
  type TokenUsage,
} from "../shared/types";
import { STREAM_RENDER_THROTTLE_MS } from "../shared/config";

export type AnthropicToolUse = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  type: "tool_use";
};

type ToolUseDraft = AnthropicToolUse & { inputJson: string };

export async function readAnthropicStream(
  response: Response,
  port: chrome.runtime.Port,
  signal: AbortSignal,
  preferredTextId?: string,
) {
  if (!response.body) throw new Error("Streaming response body is empty");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolUses: ToolUseDraft[] = [];
  const announcedToolIds = new Set<string>();
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

  function announceTool(tool: ToolUseDraft) {
    if (!tool.id || !tool.name || announcedToolIds.has(tool.id)) return;
    announcedToolIds.add(tool.id);
    post(port, {
      type: "chunk",
      chunk: {
        type: toolPartType(tool.name),
        toolCallId: tool.id,
        toolName: tool.name,
        state: CHAT_PART_STATE.inputStreaming,
        input: {},
      },
    });
  }

  function upsertTool(index: number, patch: Partial<ToolUseDraft>) {
    const current = toolUses[index] || {
      type: "tool_use" as const,
      id: "",
      name: "",
      input: {},
      inputJson: "",
    };
    toolUses[index] = { ...current, ...patch };
    announceTool(toolUses[index]);
    return toolUses[index];
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
    if (type === "content_block_start") {
      const block = objectValue(event.content_block);
      if (block?.type === "tool_use")
        upsertTool(numberValue(event.index), {
          id: optionalString(block.id),
          name: optionalString(block.name),
          input: objectValue(block.input) || {},
        });
    }
    if (type === "content_block_delta") {
      const delta = objectValue(event.delta);
      if (delta?.type === "text_delta") emitText(optionalString(delta.text));
      if (delta?.type === "thinking_delta")
        emitReasoning(optionalString(delta.thinking));
      if (delta?.type === "input_json_delta") {
        const tool = upsertTool(numberValue(event.index), {});
        tool.inputJson += optionalString(delta.partial_json);
      }
    }
    if (type === "content_block_stop") {
      const tool = toolUses[numberValue(event.index)];
      if (tool?.inputJson) tool.input = parseJsonObject(tool.inputJson);
    }
    if (type === "message_delta") {
      const delta = objectValue(event.delta);
      const eventUsage = objectValue(event.usage) || objectValue(delta?.usage);
      if (eventUsage) usage = normalizeUsage(eventUsage, usage);
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
    toolUses: toolUses.filter((tool) => tool.id && tool.name),
    usage,
  };
}

function normalizeUsage(
  usage: Record<string, unknown>,
  previous?: TokenUsage,
): TokenUsage {
  return {
    inputTokens: numberOrUndefined(usage.input_tokens) ?? previous?.inputTokens,
    outputTokens:
      numberOrUndefined(usage.output_tokens) ?? previous?.outputTokens,
    totalTokens:
      add(
        numberOrUndefined(usage.input_tokens),
        numberOrUndefined(usage.output_tokens),
      ) ?? previous?.totalTokens,
    cachedInputTokens:
      numberOrUndefined(usage.cache_read_input_tokens) ??
      previous?.cachedInputTokens,
    cacheWriteTokens:
      numberOrUndefined(usage.cache_creation_input_tokens) ??
      previous?.cacheWriteTokens,
  };
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return { value };
  }
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

function add(a: number | undefined, b: number | undefined) {
  return a === undefined && b === undefined ? undefined : (a || 0) + (b || 0);
}

function post(port: chrome.runtime.Port, message: AiStreamResponse) {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post ai-stream message", error);
  }
}

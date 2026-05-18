import {
  AI_TEXT_CHUNK_TYPE,
  CHAT_PART_STATE,
  toolPartType,
  type AiStreamResponse,
} from "../shared/types";
import { postText } from "./message-helpers";

type OpenAIToolCall = {
  id?: string;
  type?: string;
  function: { name?: string; arguments?: string };
};

export async function readOpenAIStream(
  response: Response,
  port: chrome.runtime.Port,
  signal: AbortSignal,
  preferredTextId?: string,
  deferTextUntilNoTools = false,
) {
  if (!response.body) throw new Error("Streaming response body is empty");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls: OpenAIToolCall[] = [];
  const textId = preferredTextId || crypto.randomUUID();
  const announcedToolIndexes = new Set<number>();
  let buffer = "";
  let content = "";
  let textStarted = false;
  let deferredTextPosted = false;

  function emitText(delta: string) {
    if (!delta) return;
    if (deferTextUntilNoTools) {
      content += delta;
      return;
    }
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

  function postDeferredTextNote() {
    if (!deferTextUntilNoTools || deferredTextPosted || !content) return;
    deferredTextPosted = true;
    postText(port, content, textId, signal, false);
  }

  function consumeEvent(rawEvent: string) {
    const data = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;

    const payload = JSON.parse(data) as {
      choices?: Array<{
        delta?: {
          content?: string;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };
    const delta = payload.choices?.[0]?.delta;
    emitText(delta?.content || "");

    for (const toolDelta of delta?.tool_calls || []) {
      const index = toolDelta.index ?? toolCalls.length;
      const current = toolCalls[index] || { function: {} };
      toolCalls[index] = {
        ...current,
        id: toolDelta.id || current.id,
        type: toolDelta.type || current.type || "function",
        function: {
          name: toolDelta.function?.name || current.function.name,
          arguments: `${current.function.arguments || ""}${toolDelta.function?.arguments || ""}`,
        },
      };

      const next = toolCalls[index];
      if (!announcedToolIndexes.has(index) && next.id && next.function.name) {
        announcedToolIndexes.add(index);
        postDeferredTextNote();
        post(port, {
          type: "chunk",
          chunk: {
            type: toolPartType(next.function.name),
            toolCallId: next.id,
            toolName: next.function.name,
            state: CHAT_PART_STATE.inputStreaming,
            input: {},
          },
        });
      }
    }
  }

  while (true) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const event of events) consumeEvent(event);
  }

  buffer += decoder.decode();
  if (buffer.trim()) consumeEvent(buffer);
  if (textStarted)
    post(port, {
      type: "chunk",
      chunk: { type: AI_TEXT_CHUNK_TYPE.textEnd, id: textId },
    });

  const completeToolCalls = toolCalls.filter(
    (toolCall) => toolCall.function.name,
  );
  if (deferTextUntilNoTools && content) {
    if (completeToolCalls.length && !deferredTextPosted)
      postText(port, content, textId, signal, false);
    if (!completeToolCalls.length) postText(port, content, textId, signal);
  }

  return { content, toolCalls: completeToolCalls };
}

function post(port: chrome.runtime.Port, message: AiStreamResponse) {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post ai-stream message", error);
  }
}

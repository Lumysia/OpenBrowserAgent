import { POST_TEXT_CHUNK_SIZE } from "../shared/config";
import {
  AI_TEXT_CHUNK_TYPE,
  type AiStreamResponse,
  type ChatMessage,
} from "../shared/types";

export function postText(
  port: chrome.runtime.Port,
  text: string,
  id: string,
  signal: AbortSignal,
  appendToMessageContent = true,
) {
  const chunkType = appendToMessageContent
    ? {
        start: AI_TEXT_CHUNK_TYPE.textStart,
        delta: AI_TEXT_CHUNK_TYPE.textDelta,
        end: AI_TEXT_CHUNK_TYPE.textEnd,
      }
    : {
        start: AI_TEXT_CHUNK_TYPE.textNoteStart,
        delta: AI_TEXT_CHUNK_TYPE.textNoteDelta,
        end: AI_TEXT_CHUNK_TYPE.textNoteEnd,
      };
  post(port, { type: "chunk", chunk: { type: chunkType.start, id } });
  for (const delta of chunkText(text)) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    post(port, {
      type: "chunk",
      chunk: { type: chunkType.delta, id, delta },
    });
  }
  post(port, { type: "chunk", chunk: { type: chunkType.end, id } });
}

function post(port: chrome.runtime.Port, message: AiStreamResponse) {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post ai-stream message", error);
  }
}

export function chunkText(text: string) {
  const chunks: string[] = [];
  const codePoints = Array.from(text);
  for (let index = 0; index < codePoints.length; index += POST_TEXT_CHUNK_SIZE)
    chunks.push(codePoints.slice(index, index + POST_TEXT_CHUNK_SIZE).join(""));
  return chunks;
}

export function parseToolArgs(value: string | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function renderUserMessageWithContext(message: ChatMessage) {
  if (message.metadata?.internalRetry) {
    return `<internal_instruction>
${message.content}
</internal_instruction>`;
  }

  const context =
    typeof message.metadata?.context === "string"
      ? message.metadata.context
      : "";
  const quickAction = message.metadata?.quickAction as
    | { instruction?: string }
    | undefined;
  return `${
    quickAction?.instruction
      ? `<instruction>
${quickAction.instruction}
</instruction>

`
      : ""
  }<message_context>

${context}

</message_context>${
    quickAction?.instruction
      ? ""
      : `

<message>
${message.content}
</message>`
  }`;
}

import {
  AI_TEXT_CHUNK_TYPE,
  CHAT_PART_STATE,
  isToolPartType,
  toolNameFromPartType,
  toolPartType,
  type ChatPart,
} from "./types";
import { mergePart, streamedText } from "./chat-part-merge";

export function applyPart(parts: ChatPart[] = [], part: ChatPart) {
  const index = parts.findIndex((candidate) => candidate.id === part.id);
  if (index === -1) return [...parts, part];
  return parts.map((candidate, candidateIndex) => {
    if (candidateIndex !== index) return candidate;
    return mergePart(candidate, part, streamedText);
  });
}

export function streamPartFromChunk(chunk: unknown): {
  delta?: string;
  part?: ChatPart;
} {
  if (!chunk || typeof chunk !== "object") return {};
  const maybe = chunk as {
    type?: string;
    id?: string;
    delta?: string;
    toolCallId?: string;
    toolName?: string;
    state?:
      | (typeof CHAT_PART_STATE)["inputStreaming"]
      | (typeof CHAT_PART_STATE)["inputAvailable"]
      | (typeof CHAT_PART_STATE)["outputAvailable"]
      | (typeof CHAT_PART_STATE)["outputError"];
    input?: unknown;
    output?: unknown;
    result?: ChatPart["result"];
    step?: string;
    error?: string;
    text?: string;
  };
  if (maybe.type === AI_TEXT_CHUNK_TYPE.contextSummary)
    return {
      part: {
        id: maybe.id || crypto.randomUUID(),
        type: "summary",
        text: maybe.text || "",
        ...(maybe.error ? { error: maybe.error } : {}),
        state: CHAT_PART_STATE.done,
      },
    };
  if (
    maybe.type === AI_TEXT_CHUNK_TYPE.textStart ||
    maybe.type === AI_TEXT_CHUNK_TYPE.textNoteStart
  )
    return {
      part: {
        id: maybe.id || crypto.randomUUID(),
        type:
          maybe.type === AI_TEXT_CHUNK_TYPE.textNoteStart
            ? "reasoning"
            : "text",
        text: "",
      },
    };
  if (
    maybe.type === AI_TEXT_CHUNK_TYPE.textEnd ||
    maybe.type === AI_TEXT_CHUNK_TYPE.textNoteEnd
  )
    return {};
  if (
    maybe.type === AI_TEXT_CHUNK_TYPE.textDelta ||
    maybe.type === AI_TEXT_CHUNK_TYPE.textNoteDelta
  )
    return {
      delta:
        maybe.type === AI_TEXT_CHUNK_TYPE.textDelta
          ? maybe.delta || ""
          : undefined,
      part: {
        id: maybe.id || crypto.randomUUID(),
        type:
          maybe.type === AI_TEXT_CHUNK_TYPE.textNoteDelta
            ? "reasoning"
            : "text",
        text: maybe.delta || "",
        append: true,
      },
    };
  if (maybe.type && isToolPartType(maybe.type)) {
    const toolName = maybe.toolName || toolNameFromPartType(maybe.type);
    return {
      part: {
        id: maybe.toolCallId || maybe.id || crypto.randomUUID(),
        type: toolPartType(toolName),
        toolName,
        state: maybe.state || CHAT_PART_STATE.inputAvailable,
        input: maybe.input,
        output: maybe.output,
        result: maybe.result,
        step: maybe.step,
        error: maybe.error,
      },
    };
  }
  return {};
}

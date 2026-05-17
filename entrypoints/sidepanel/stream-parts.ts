import {
  AI_TEXT_CHUNK_TYPE,
  CHAT_PART_STATE,
  isToolPartType,
  toolNameFromPartType,
  toolPartType,
} from "../../src/shared/types";
import type { ChatPart } from "../../src/shared/types";

export function applyPart(parts: ChatPart[] = [], part: ChatPart) {
  const index = parts.findIndex((candidate) => candidate.id === part.id);
  if (index === -1) return [...parts, part];
  return parts.map((candidate, candidateIndex) => {
    if (candidateIndex !== index) return candidate;
    if (candidate.type === "text" && part.type === "text" && part.append)
      return {
        ...candidate,
        text: `${candidate.text || ""}${part.text || ""}`,
      };
    return { ...candidate, ...part };
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
    error?: string;
  };
  if (
    maybe.type === AI_TEXT_CHUNK_TYPE.textStart ||
    maybe.type === AI_TEXT_CHUNK_TYPE.textNoteStart
  )
    return {
      part: { id: maybe.id || crypto.randomUUID(), type: "text", text: "" },
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
        type: "text",
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
        error: maybe.error,
      },
    };
  }
  return {};
}

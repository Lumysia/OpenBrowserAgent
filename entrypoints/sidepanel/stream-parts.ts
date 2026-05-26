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
    return mergePart(candidate, part);
  });
}

function mergePart(current: ChatPart, next: ChatPart): ChatPart {
  if (current.type !== next.type) return { ...current, ...definedPart(next) };
  if (current.type === "text" || current.type === "reasoning")
    return mergeTextPart(current, next);
  if (isToolPartType(current.type)) return mergeToolPart(current, next);
  return { ...current, ...definedPart(next) };
}

function mergeTextPart(current: ChatPart, next: ChatPart): ChatPart {
  if (next.append)
    return { ...current, text: `${current.text || ""}${next.text || ""}` };
  return {
    ...current,
    ...definedPart(next),
    text: next.text || current.text,
  };
}

function mergeToolPart(current: ChatPart, next: ChatPart): ChatPart {
  const merged = { ...current, ...definedPart(next) };
  return {
    ...merged,
    state: mergeToolState(current.state, next.state),
  };
}

function mergeToolState(current: ChatPart["state"], next: ChatPart["state"]) {
  if (!next) return current;
  if (!current) return next;
  return toolStateRank(next) >= toolStateRank(current) ? next : current;
}

function toolStateRank(state: ChatPart["state"]) {
  if (state === CHAT_PART_STATE.outputError) return 4;
  if (state === CHAT_PART_STATE.outputAvailable) return 3;
  if (state === CHAT_PART_STATE.inputAvailable) return 2;
  if (state === CHAT_PART_STATE.inputStreaming) return 1;
  return 0;
}

function definedPart(part: ChatPart) {
  return Object.fromEntries(
    Object.entries(part).filter(([, value]) => value !== undefined),
  ) as Partial<ChatPart>;
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
        error: maybe.error,
      },
    };
  }
  return {};
}

import {
  CHAT_PART_STATE,
  isToolPartType,
  type Chat,
  type ChatMessage,
  type ChatPart,
} from "./types";

const CHAT_MESSAGE_ROLES = new Set(["user", "assistant", "system", "tool"]);
const TEXT_PART_TYPES = new Set(["text", "reasoning", "summary"]);
const CHAT_PART_STATES = new Set<string>(Object.values(CHAT_PART_STATE));

export function normalizeChats(value: unknown): Chat[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeChat);
}

function normalizeChat(value: unknown): Chat {
  const chat = objectValue(value);
  const now = Date.now();
  return {
    id: stringValue(chat.id) || crypto.randomUUID(),
    title: stringValue(chat.title),
    messages: Array.isArray(chat.messages)
      ? chat.messages.map(normalizeChatMessage)
      : [],
    agentId: optionalString(chat.agentId),
    kind: chat.kind === "subagent" ? "subagent" : "normal",
    parentChatId: optionalString(chat.parentChatId),
    parentMessageId: optionalString(chat.parentMessageId),
    parentToolCallId: optionalString(chat.parentToolCallId),
    childChatIds: stringArray(chat.childChatIds),
    imageGenerationJobs: Array.isArray(chat.imageGenerationJobs)
      ? chat.imageGenerationJobs
      : undefined,
    sources: Array.isArray(chat.sources) ? chat.sources : undefined,
    pinnedAt: optionalNumber(chat.pinnedAt),
    createdAt: numberValue(chat.createdAt, now),
    updatedAt: numberValue(chat.updatedAt, now),
  };
}

function normalizeChatMessage(value: unknown): ChatMessage {
  const message = objectValue(value);
  return {
    id: stringValue(message.id) || crypto.randomUUID(),
    role: CHAT_MESSAGE_ROLES.has(stringValue(message.role))
      ? (message.role as ChatMessage["role"])
      : "user",
    content: stringValue(message.content),
    createdAt: numberValue(message.createdAt, Date.now()),
    parts: Array.isArray(message.parts)
      ? message.parts.map(normalizeChatPart).filter(isChatPart)
      : undefined,
    metadata: plainRecord(message.metadata),
  };
}

function normalizeChatPart(value: unknown): ChatPart | undefined {
  const part = objectValue(value);
  const type = stringValue(part.type);
  if (!TEXT_PART_TYPES.has(type) && !isToolPartType(type)) return undefined;
  const state = stringValue(part.state);
  return {
    id: stringValue(part.id) || crypto.randomUUID(),
    type: type as ChatPart["type"],
    text: optionalString(part.text),
    append: part.append === true,
    toolName: optionalString(part.toolName),
    state: CHAT_PART_STATES.has(state)
      ? (state as ChatPart["state"])
      : undefined,
    input: part.input,
    output: part.output,
    error: optionalString(part.error),
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown) {
  const text = stringValue(value);
  return text || undefined;
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function isChatPart(part: ChatPart | undefined): part is ChatPart {
  return !!part;
}

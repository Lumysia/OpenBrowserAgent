import {
  CHAT_PART_STATE,
  isToolPartType,
  type Chat,
  type ChatMessage,
  type ChatPart,
  type RunMetrics,
} from "./types";

const CHAT_MESSAGE_ROLES = new Set(["user", "assistant", "system", "tool"]);
const TEXT_PART_TYPES = new Set(["text", "reasoning", "summary"]);
const CHAT_PART_STATES = new Set<string>(Object.values(CHAT_PART_STATE));

export function normalizeChats(value: unknown): Chat[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeChat);
}

export function reconcileChatSnapshots(
  current: Chat[] | undefined,
  incoming: Chat[],
) {
  if (!current?.length) return incoming;
  const currentById = new Map(current.map((chat) => [chat.id, chat]));
  const incomingIds = new Set(incoming.map((chat) => chat.id));
  let changed = false;
  const reconciled = incoming.map((chat) => {
    const currentChat = currentById.get(chat.id);
    if (!currentChat) return chat;
    const nextChat = reconcileChatSnapshot(currentChat, chat);
    if (nextChat !== chat) changed = true;
    return nextChat;
  });
  for (const chat of current) {
    if (incomingIds.has(chat.id) || !hasUnfinishedRun(chat)) continue;
    reconciled.push(chat);
    changed = true;
  }
  return changed ? reconciled : incoming;
}

export function chatSnapshot(chats: Chat[]) {
  const tokens = [`chats:${chats.length}`];
  for (const chat of chats) {
    tokens.push(
      chat.id,
      String(chat.createdAt),
      String(chat.updatedAt),
      stringFingerprint(chat.title),
      String(chat.pinnedAt || 0),
      String(chat.messages.length),
      String(chat.sources?.length || 0),
      String(chat.imageGenerationJobs?.length || 0),
    );
    for (const message of chat.messages) {
      const metrics = runMetrics(message);
      tokens.push(
        message.id,
        message.role,
        String(message.createdAt),
        stringFingerprint(message.content),
        String(message.parts?.length || 0),
        String(metrics.startedAt || 0),
        String(metrics.firstTokenAt || 0),
        String(metrics.endedAt || 0),
        String(metrics.streamEventIndex || 0),
        String(metrics.outputCharacters || 0),
      );
      for (const part of message.parts || []) {
        tokens.push(
          part.id,
          part.type,
          part.state || "",
          part.toolName || "",
          stringFingerprint(part.text || ""),
          part.input === undefined ? "i0" : "i1",
          part.output === undefined ? "o0" : "o1",
          part.error ? stringFingerprint(part.error) : "e0",
        );
      }
    }
  }
  return tokens.join("\u001f");
}

export function hasUnfinishedChatRun(value: unknown) {
  if (!Array.isArray(value)) return false;
  return (value as Chat[]).some(hasUnfinishedRun);
}

function reconcileChatSnapshot(current: Chat, incoming: Chat) {
  const currentMessages = new Map(
    current.messages.map((message) => [message.id, message]),
  );
  if (hasMissingUnfinishedRun(current, incoming)) {
    return { ...incoming, messages: current.messages };
  }

  let changed = false;
  const messages = incoming.messages.map((message) => {
    const currentMessage = currentMessages.get(message.id);
    if (!currentMessage || !isCurrentRunNewer(currentMessage, message))
      return message;
    changed = true;
    return reconcileRunMessage(currentMessage, message);
  });
  if (!changed) return incoming;
  return {
    ...incoming,
    messages,
    sources:
      (current.sources?.length || 0) > (incoming.sources?.length || 0)
        ? current.sources
        : incoming.sources,
    imageGenerationJobs:
      (current.imageGenerationJobs?.length || 0) >
      (incoming.imageGenerationJobs?.length || 0)
        ? current.imageGenerationJobs
        : incoming.imageGenerationJobs,
  };
}

function hasMissingUnfinishedRun(current: Chat, incoming: Chat) {
  const incomingIds = new Set(incoming.messages.map((message) => message.id));
  return current.messages.some(
    (message) => isUnfinishedRun(message) && !incomingIds.has(message.id),
  );
}

function hasUnfinishedRun(chat: Chat) {
  return chat.messages.some(isUnfinishedRun);
}

function stringFingerprint(value: string | undefined) {
  const text = value || "";
  if (text.length <= 96) return text;
  return `${text.length}:${text.slice(0, 48)}:${text.slice(-48)}`;
}

function isUnfinishedRun(message: ChatMessage) {
  const metrics = runMetrics(message);
  return (
    message.role === "assistant" &&
    typeof metrics.startedAt === "number" &&
    metrics.endedAt === undefined
  );
}

function isCurrentRunNewer(current: ChatMessage, incoming: ChatMessage) {
  if (current.role !== "assistant") return false;
  const currentMetrics = runMetrics(current);
  if (typeof currentMetrics.startedAt !== "number") return false;
  const incomingMetrics = runMetrics(incoming);
  const currentIndex = numberValue(currentMetrics.streamEventIndex, 0);
  const incomingIndex = numberValue(incomingMetrics.streamEventIndex, 0);
  return (
    currentIndex > incomingIndex ||
    current.content.length > incoming.content.length ||
    partProgress(current.parts) > partProgress(incoming.parts) ||
    (currentMetrics.endedAt !== undefined &&
      incomingMetrics.endedAt === undefined)
  );
}

function reconcileRunMessage(
  current: ChatMessage,
  incoming: ChatMessage,
): ChatMessage {
  return {
    ...incoming,
    content:
      current.content.length > incoming.content.length
        ? current.content
        : incoming.content,
    parts: reconcileParts(current.parts, incoming.parts),
    metadata: reconcileRunMetadata(current.metadata, incoming.metadata),
  };
}

function reconcileParts(
  current: ChatPart[] | undefined,
  incoming: ChatPart[] | undefined,
) {
  if (!current?.length) return incoming;
  if (!incoming?.length) return current;
  const currentById = new Map(current.map((part) => [part.id, part]));
  const incomingIds = new Set(incoming.map((part) => part.id));
  const merged = incoming.map((part) => {
    const currentPart = currentById.get(part.id);
    return currentPart ? reconcilePart(currentPart, part) : part;
  });
  for (const part of current) {
    if (!incomingIds.has(part.id)) merged.push(part);
  }
  return merged;
}

function reconcilePart(current: ChatPart, incoming: ChatPart): ChatPart {
  if (current.type !== incoming.type) return incoming;
  if (current.type === "text" || current.type === "reasoning") {
    const currentText = current.text || "";
    const incomingText = incoming.text || "";
    return {
      ...incoming,
      text:
        currentText.length > incomingText.length ? currentText : incomingText,
      state: current.state || incoming.state,
    };
  }
  if (!isToolPartType(current.type)) return incoming;
  return {
    ...incoming,
    input: incoming.input === undefined ? current.input : incoming.input,
    output: incoming.output === undefined ? current.output : incoming.output,
    error: incoming.error || current.error,
    state:
      toolStateRank(current.state) > toolStateRank(incoming.state)
        ? current.state
        : incoming.state,
  };
}

function reconcileRunMetadata(
  current: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined,
) {
  const currentMetrics = runMetricsFromMetadata(current);
  const incomingMetrics = runMetricsFromMetadata(incoming);
  return {
    ...(current || {}),
    ...(incoming || {}),
    runMetrics: {
      ...currentMetrics,
      ...incomingMetrics,
      startedAt: currentMetrics.startedAt || incomingMetrics.startedAt,
      firstTokenAt: currentMetrics.firstTokenAt || incomingMetrics.firstTokenAt,
      endedAt: incomingMetrics.endedAt || currentMetrics.endedAt,
      streamEventIndex: Math.max(
        numberValue(currentMetrics.streamEventIndex, 0),
        numberValue(incomingMetrics.streamEventIndex, 0),
      ),
      outputCharacters: Math.max(
        numberValue(currentMetrics.outputCharacters, 0),
        numberValue(incomingMetrics.outputCharacters, 0),
      ),
      usage: {
        ...(currentMetrics.usage || {}),
        ...(incomingMetrics.usage || {}),
      },
      contextBudget:
        incomingMetrics.contextBudget || currentMetrics.contextBudget,
    },
  };
}

function runMetrics(message: ChatMessage): RunMetrics {
  return runMetricsFromMetadata(message.metadata);
}

function runMetricsFromMetadata(
  metadata: Record<string, unknown> | undefined,
): RunMetrics {
  return ((metadata?.runMetrics || {}) as RunMetrics) || {};
}

function partProgress(parts: ChatPart[] | undefined) {
  return (parts || []).reduce(
    (total, part) =>
      total +
      (part.text?.length || 0) +
      toolStateRank(part.state) +
      (part.input === undefined ? 0 : 1) +
      (part.output === undefined ? 0 : 2) +
      (part.error ? 2 : 0),
    0,
  );
}

function toolStateRank(state: ChatPart["state"]) {
  if (state === CHAT_PART_STATE.outputError) return 4;
  if (state === CHAT_PART_STATE.outputAvailable) return 3;
  if (state === CHAT_PART_STATE.inputAvailable) return 2;
  if (state === CHAT_PART_STATE.inputStreaming) return 1;
  return 0;
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

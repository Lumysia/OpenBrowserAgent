import { readId } from "./read-ids";
import {
  CHAT_PART_STATE,
  isToolPartType,
  type Chat,
  type ChatContent,
  type ChatMessage,
  type ChatMeta,
  type ChatSummary,
  type ChatPart,
  type RunMetrics,
} from "./types";

const CHAT_MESSAGE_ROLES = new Set(["user", "assistant", "system", "tool"]);
const TEXT_PART_TYPES = new Set(["text", "reasoning", "summary"]);
const CHAT_PART_STATES = new Set<string>(Object.values(CHAT_PART_STATE));

export function normalizeChatSummaries(value: unknown): ChatSummary[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const summary = objectValue(item);
    return {
      ...chatMeta(normalizeChat(item, index)),
      messageCount: numberValue(summary.messageCount, 0),
      running: summary.running === true || undefined,
      attachmentIds: stringArray(summary.attachmentIds),
    };
  });
}

export function normalizeChatContent(value: unknown): ChatContent {
  return chatContent(normalizeChat(value));
}

const CONTENT_FIELDS = ["messages", "sources", "imageGenerationJobs"] as const;

export function chatContent(chat: ChatContent): ChatContent {
  return {
    messages: chat.messages,
    ...(chat.sources ? { sources: chat.sources } : {}),
    ...(chat.imageGenerationJobs
      ? { imageGenerationJobs: chat.imageGenerationJobs }
      : {}),
  };
}

export function chatMeta(chat: ChatMeta): ChatMeta {
  const meta = { ...chat } as Record<string, unknown>;
  for (const field of [
    ...CONTENT_FIELDS,
    "messageCount",
    "running",
    "attachmentIds",
  ])
    delete meta[field];
  for (const [field, value] of Object.entries(meta))
    if (value === undefined) delete meta[field];
  return meta as ChatMeta;
}

// What the list keeps about a chat's content. `attachmentIds` is derived when
// the content is stored (it scans the whole content).
export function chatFacts(content: ChatContent, attachmentIds?: string[]) {
  return {
    messageCount: content.messages.length,
    ...(hasUnfinishedRun(content) ? { running: true } : {}),
    ...(attachmentIds?.length ? { attachmentIds } : {}),
  };
}

export function chatSummary(chat: Chat): ChatSummary {
  return { ...chatMeta(chat), ...chatFacts(chat) };
}

// A list entry with new metadata or facts; facts left out are cleared.
export function withChatFacts(
  summary: ChatMeta,
  facts: ReturnType<typeof chatFacts>,
): ChatSummary {
  return { ...chatMeta(summary), ...facts };
}

// The list without these chats (their contents leave with them) and without
// links to them.
export function withoutChats(
  chats: ChatSummary[],
  removedIds: ReadonlySet<string>,
) {
  if (!chats.some((chat) => removedIds.has(chat.id))) return chats;
  return chats
    .filter((chat) => !removedIds.has(chat.id))
    .map((chat) =>
      chat.childChatIds?.some((id) => removedIds.has(id))
        ? {
            ...chat,
            childChatIds: chat.childChatIds.filter((id) => !removedIds.has(id)),
          }
        : chat,
    );
}

export function joinChat(meta: ChatMeta, content: ChatContent): Chat {
  return { ...chatMeta(meta), ...content };
}

// A summary differs in what the list shows or sync needs.
export function sameChatSummary(left: ChatSummary, right: ChatSummary) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// Merge an incoming copy of a chat's content into the one in use, keeping the
// progress of a reply that is still streaming here.
export function reconcileChatContent(
  current: ChatContent | undefined,
  incoming: ChatContent,
): ChatContent {
  if (!current) return incoming;
  const reconciled = reconcileChatSnapshot(current, incoming);
  return reconciled === incoming ? incoming : chatContent(reconciled);
}

// Cheap fingerprint of content, enough to recognize a copy this context wrote.
export function chatContentSnapshot(content: ChatContent) {
  const tokens = [
    String(content.messages.length),
    String(content.sources?.length || 0),
    String(content.imageGenerationJobs?.length || 0),
  ];
  for (const message of content.messages) {
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
        part.result ? stringFingerprint(part.result.text) : "r0",
        part.error ? stringFingerprint(part.error) : "e0",
      );
    }
  }
  return tokens.join("\u001f");
}

function reconcileChatSnapshot(current: ChatContent, incoming: ChatContent) {
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

function hasMissingUnfinishedRun(current: ChatContent, incoming: ChatContent) {
  const incomingIds = new Set(incoming.messages.map((message) => message.id));
  return current.messages.some(
    (message) => isUnfinishedRun(message) && !incomingIds.has(message.id),
  );
}

function hasUnfinishedRun(chat: ChatContent) {
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
    result: incoming.result || current.result,
    step: incoming.step || current.step,
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
      (part.result ? 2 : 0) +
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

// `index`: its place in a stored list, which names it when it has no id.
function normalizeChat(value: unknown, index = 0): Chat {
  const chat = objectValue(value);
  const now = Date.now();
  return {
    id: readId(value, index),
    title: stringValue(chat.title),
    messages: Array.isArray(chat.messages)
      ? chat.messages.map((message, at) => normalizeChatMessage(message, at))
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

function normalizeChatMessage(value: unknown, index: number): ChatMessage {
  const message = objectValue(value);
  return {
    id: readId(value, index),
    role: CHAT_MESSAGE_ROLES.has(stringValue(message.role))
      ? (message.role as ChatMessage["role"])
      : "user",
    content: stringValue(message.content),
    createdAt: numberValue(message.createdAt, Date.now()),
    parts: Array.isArray(message.parts)
      ? message.parts
          .map((part, at) => normalizeChatPart(part, at))
          .filter(isChatPart)
      : undefined,
    metadata: plainRecord(message.metadata),
  };
}

function normalizeChatPart(
  value: unknown,
  index: number,
): ChatPart | undefined {
  const part = objectValue(value);
  const type = stringValue(part.type);
  if (!TEXT_PART_TYPES.has(type) && !isToolPartType(type)) return undefined;
  const state = stringValue(part.state);
  return {
    id: readId(value, index),
    type: type as ChatPart["type"],
    text: optionalString(part.text),
    // Only a streamed delta carries it: a stored part without it must stay
    // the same, or every load would rewrite the chat's earlier messages.
    append: part.append === true || undefined,
    toolName: optionalString(part.toolName),
    state: CHAT_PART_STATES.has(state)
      ? (state as ChatPart["state"])
      : undefined,
    input: part.input,
    output: part.output,
    result: toolResultValue(part.result),
    step: optionalString(part.step),
    error: optionalString(part.error),
  };
}

function toolResultValue(value: unknown): ChatPart["result"] {
  const result = objectValue(value);
  if (typeof result.text !== "string") return undefined;
  return {
    text: result.text,
    ...(result.image === true ? { image: true } : {}),
    ...(optionalString(result.artifact)
      ? { artifact: optionalString(result.artifact) }
      : {}),
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

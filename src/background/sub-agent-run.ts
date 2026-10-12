import { chatContent, chatMeta, withChatFacts } from "../shared/chats";
import { saveChatContent } from "../shared/chat-storage";
import { streamPartFromChunk } from "../shared/chat-stream-parts";
import {
  appendAssistantPart,
  updateAssistantRunMetrics,
} from "../shared/chat-updates";
import { storage } from "../shared/storage";
import type {
  Agent,
  AiStreamResponse,
  Chat,
  ChatMessage,
} from "../shared/types";
import { runChat } from "./run-chat";
import type { UsageMetrics } from "./run-usage";
import * as sessions from "./stream-sessions";

const PERSIST_INTERVAL_MS = 2_000;

export type SubAgentProgress = { toolName: string; state?: string };

// A sub-agent chat run by the service worker, whether or not the side panel
// is open. The chat is stored like any other (linked to its parent), and its
// stream session lets an open side panel follow it live.
export async function runSubAgentChat(options: {
  agent: Agent;
  task: string;
  title: string;
  parent: { chatId: string; messageId?: string; toolCallId: string };
  onStart(chatId: string): void;
  onProgress(progress: SubAgentProgress[]): void;
  signal?: AbortSignal;
}) {
  const { agent, task, parent } = options;
  const now = Date.now();
  const assistantId = crypto.randomUUID();
  const user: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: task,
    createdAt: now,
    metadata: { subAgent: true, parentChatId: parent.chatId },
  };
  let chat: Chat = {
    id: crypto.randomUUID(),
    title: options.title,
    agentId: agent.id,
    kind: "subagent",
    parentChatId: parent.chatId,
    parentMessageId: parent.messageId,
    parentToolCallId: parent.toolCallId,
    messages: [
      user,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        parts: [],
        createdAt: now,
        metadata: { runMetrics: { startedAt: now, streamEventIndex: 0 } },
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  await persist(chat, true);
  options.onStart(chat.id);

  const session = sessions.createStreamSession(chat.id);
  let dirty = false;
  const progress: SubAgentProgress[] = [];
  let usage: UsageMetrics | undefined;
  const timer = setInterval(() => {
    if (!dirty) return;
    dirty = false;
    persist(chat).catch((error) =>
      console.warn("Failed to store sub-agent chat", error),
    );
  }, PERSIST_INTERVAL_MS);
  session.observers.add((event: AiStreamResponse) => {
    if (event.type === "chunk") {
      const { delta, part } = streamPartFromChunk(event.chunk);
      chat = appendAssistantPart(chat, { messageId: assistantId, delta, part });
      if (part?.toolName) {
        const existing = progress.find(
          (item) =>
            item.toolName === part.toolName &&
            item.state !== "output-available",
        );
        if (existing) existing.state = part.state;
        else progress.push({ toolName: part.toolName, state: part.state });
        options.onProgress(progress.slice(-6));
      }
      dirty = true;
    } else if (event.type === "metrics") {
      usage = event.metrics;
      chat = updateAssistantRunMetrics(chat, assistantId, event.metrics);
      dirty = true;
    }
  });
  const abort = () => sessions.abortSession(chat.id);
  options.signal?.addEventListener("abort", abort, { once: true });
  // A stop that landed while the chat was being created fires no event.
  if (options.signal?.aborted) abort();
  let error: string | undefined;
  try {
    await runChat(session, {
      agentId: agent.id,
      messages: [user],
      messageId: assistantId,
      depth: 1,
      parentChatId: parent.chatId,
    });
    sessions.postToSession(session, { type: "end" });
  } catch (cause) {
    error = session.abortController.signal.aborted
      ? "The sub-agent was stopped."
      : cause instanceof Error
        ? cause.message
        : String(cause);
    sessions.postToSession(session, { type: "error", error });
  } finally {
    clearInterval(timer);
    options.signal?.removeEventListener("abort", abort);
    sessions.scheduleSessionCleanup(session);
  }
  chat = updateAssistantRunMetrics(chat, assistantId, { endedAt: Date.now() });
  await persist(chat);
  const answer =
    chat.messages
      .find((message) => message.id === assistantId)
      ?.content.trim() || "";
  return { chatId: chat.id, answer, error, usage };
}

// Stores the chat's content and its list entry; a new chat is also linked
// from its parent.
async function persist(chat: Chat, created = false) {
  const { facts } = await saveChatContent(chat.id, chatContent(chat));
  await storage.chats.update((items) => {
    const summary = withChatFacts(chatMeta(chat), facts);
    const listed = items.some((item) => item.id === chat.id);
    const next = listed
      ? items.map((item) => (item.id === chat.id ? summary : item))
      : [...items, summary];
    return created
      ? next.map((item) =>
          item.id === chat.parentChatId
            ? {
                ...item,
                childChatIds: [
                  ...new Set([...(item.childChatIds || []), chat.id]),
                ],
              }
            : item,
        )
      : next;
  });
}

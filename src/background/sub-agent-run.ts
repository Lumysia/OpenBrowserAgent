import { CHAT_PART_STATE } from "../shared/types";
import { chatContent, chatMeta, withChatFacts } from "../shared/chats";
import { saveChatContent } from "../shared/chat-storage";
import { streamPartFromChunk } from "../shared/chat-stream-parts";
import {
  appendAssistantPart,
  endAssistantRun,
  updateAssistantRunMetrics,
} from "../shared/chat-updates";
import { getMessages } from "../shared/i18n";
import { RUN_STOP_REASON, type RunStopReason } from "../shared/run-stop";
import { storage } from "../shared/storage";
import { userErrorText } from "../shared/user-errors";
import type {
  Agent,
  AiStreamResponse,
  Chat,
  ChatMessage,
} from "../shared/types";
import { runChat, type UnattendedRequest } from "./run-chat";
import type { UsageMetrics } from "./run-usage";
import * as sessions from "./stream-sessions";

const PERSIST_INTERVAL_MS = 2_000;

type SubAgentProgress = { toolName: string; state?: string };

type ChatLink = Pick<
  Chat,
  "kind" | "parentChatId" | "parentMessageId" | "parentToolCallId" | "taskId"
>;

// A chat run by the service worker, whether or not the side panel is open:
// a sub-agent's (linked to its parent) or a scheduled task's. The chat is
// stored like any other, and its stream session lets an open side panel
// follow it live.
export async function runBackgroundChat(options: {
  agent: Agent;
  // What the chat shows as the user's message.
  content: string;
  // What the agent gets instead, when it differs (a task's instructions).
  instruction?: string;
  title: string;
  link: ChatLink;
  // The tab the run starts on.
  tabId?: number;
  depth: number;
  unattended?: UnattendedRequest;
  messageMetadata?: Record<string, unknown>;
  onStart(chatId: string): void;
  onProgress?(progress: SubAgentProgress[]): void;
  signal?: AbortSignal;
}) {
  const { agent } = options;
  const now = Date.now();
  const assistantId = crypto.randomUUID();
  const user: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: options.content,
    createdAt: now,
    metadata: options.messageMetadata,
  };
  let chat: Chat = {
    id: crypto.randomUUID(),
    title: options.title,
    agentId: agent.id,
    ...options.link,
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
      console.warn("Failed to store background chat", error),
    );
  }, PERSIST_INTERVAL_MS);
  session.observers.add((event: AiStreamResponse) => {
    if (event.type === "chunk") {
      const { delta, part } = streamPartFromChunk(event.chunk);
      chat = appendAssistantPart(chat, { messageId: assistantId, delta, part });
      if (part?.toolName && options.onProgress) {
        const existing = progress.find(
          (item) =>
            item.toolName === part.toolName &&
            item.state !== CHAT_PART_STATE.outputAvailable,
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
  let end: { stopReason?: RunStopReason; error?: string } = {};
  try {
    const instruction = options.instruction ?? options.content;
    await runChat(session, {
      agentId: agent.id,
      messages: [{ ...user, content: instruction }],
      messageId: assistantId,
      depth: options.depth,
      parentChatId: options.link.parentChatId,
      tabId: options.tabId,
      unattended: options.unattended,
    });
    sessions.postToSession(session, { type: "end" });
  } catch (cause) {
    const stopped = session.abortController.signal.aborted;
    // The caller gets `error`; the chat shows it in the UI language.
    error = stopped
      ? "The run was stopped."
      : cause instanceof Error
        ? cause.message
        : String(cause);
    if (stopped) {
      end = { stopReason: RUN_STOP_REASON.aborted };
      sessions.postToSession(session, { type: "end", ...end });
    } else {
      end = {
        error: userErrorText(cause, getMessages(await storage.language.get())),
      };
      sessions.postToSession(session, { type: "error", error: end.error! });
    }
  } finally {
    clearInterval(timer);
    options.signal?.removeEventListener("abort", abort);
    sessions.scheduleSessionCleanup(session);
  }
  chat = endAssistantRun(chat, assistantId, { endedAt: Date.now(), ...end });
  await persist(chat);
  const answer =
    chat.messages
      .find((message) => message.id === assistantId)
      ?.content.trim() || "";
  return { chatId: chat.id, answer, error, usage };
}

// A sub-agent's chat, linked to the tool call that started it.
export function runSubAgentChat(options: {
  agent: Agent;
  task: string;
  title: string;
  parent: {
    chatId: string;
    messageId?: string;
    toolCallId: string;
    // The parent's tab, where the sub-agent starts.
    tabId?: number;
  };
  unattended?: UnattendedRequest;
  onStart(chatId: string): void;
  onProgress(progress: SubAgentProgress[]): void;
  signal?: AbortSignal;
}) {
  const { parent } = options;
  return runBackgroundChat({
    agent: options.agent,
    content: options.task,
    title: options.title,
    link: {
      kind: "subagent",
      parentChatId: parent.chatId,
      parentMessageId: parent.messageId,
      parentToolCallId: parent.toolCallId,
    },
    tabId: parent.tabId,
    depth: 1,
    unattended: options.unattended,
    messageMetadata: { subAgent: true, parentChatId: parent.chatId },
    onStart: options.onStart,
    onProgress: options.onProgress,
    signal: options.signal,
  });
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
    return created && chat.parentChatId
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

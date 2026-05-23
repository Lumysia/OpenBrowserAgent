import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  Agent,
  Chat,
  Preferences,
  RunMetrics,
  SendMessagesRequest,
  UploadedAttachment,
} from "../../src/shared/types";
import { AI_STREAM_REQUEST_TYPE as STREAM_REQUEST } from "../../src/shared/types";
import { createStreamHandlers } from "./stream-handlers";
import type { ActiveStreamMap } from "./sidepanel-menu-state";
import { useAutoRetryStream } from "./sidepanel-effects";
import { closedChatIds } from "./chat-state-actions";
import {
  attachStreamAction,
  closeStreamPort,
  startStreamAction,
} from "./stream-port";

export function useParallelChatStreams({
  activeChatId,
  currentChat,
  chats,
  preferences,
  language,
  uploadedAttachments,
  agent,
  setChats,
  setUnreadCompletedChats,
  onStreamChunk,
}: {
  activeChatId?: string;
  currentChat?: Chat;
  chats: Chat[] | undefined;
  preferences?: Preferences;
  language: string | undefined;
  uploadedAttachments: UploadedAttachment[];
  agent: Agent;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setUnreadCompletedChats: Dispatch<SetStateAction<Record<string, true>>>;
  onStreamChunk?: (event: {
    chatId: string;
    messageId: string;
    chunk: unknown;
  }) => void;
}) {
  const [activeStreams, setActiveStreamsState] = useState<ActiveStreamMap>({});
  const portRefs = useRef<Record<string, chrome.runtime.Port | undefined>>({});
  const chatsRef = useRef<Chat[]>([]);
  const activeChatIdRef = useRef<string | undefined>(undefined);
  const queuedMessageRemoverRef = useRef<(id: string, chatId: string) => void>(
    () => undefined,
  );
  const lastStreamActivityRef = useRef<Record<string, number>>({});
  const activeStreamsRef = useRef<ActiveStreamMap>({});
  const streamHandlers = useMemo(
    () => createStreamHandlers(setChats),
    [setChats],
  );
  const setActiveStreams: typeof setActiveStreamsState = useCallback(
    (value) => {
      setActiveStreamsState((items) => {
        const next = typeof value === "function" ? value(items) : value;
        activeStreamsRef.current = next;
        return next;
      });
    },
    [],
  );
  const streaming = Object.keys(activeStreams).length > 0;
  const currentChatStreaming = !!(currentChat && activeStreams[currentChat.id]);
  const currentAssistantMessageId = currentChat
    ? activeStreams[currentChat.id]?.assistantMessageId
    : undefined;

  useEffect(() => {
    chatsRef.current = chats || [];
  }, [chats]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useAutoRetryStream({
    streaming,
    autoRetry: preferences?.autoRetry,
    activeStreamsRef,
    lastStreamActivityRef,
    chatsRef,
    preferences,
    language,
    uploadedAttachments,
    agent,
    appendToAssistant: streamHandlers.appendToAssistant,
    startStream,
  });

  useEffect(() => {
    if (!currentChat || activeStreams[currentChat.id]) return;
    const message = resumableAssistantMessage(currentChat);
    if (!message) return;
    setActiveStreams((items) => ({
      ...items,
      [currentChat.id]: {
        chatId: currentChat.id,
        assistantMessageId: message.id,
        retryCount: 0,
        hasProgress: true,
      },
    }));
    const metrics = message.metadata?.runMetrics as RunMetrics | undefined;
    attachStream(currentChat.id, message.id, metrics?.streamEventIndex);
  }, [activeStreams, currentChat, setActiveStreams]);

  function startStream(request: SendMessagesRequest, targetMessageId: string) {
    startStreamAction({
      request,
      targetMessageId,
      portRefs,
      activeStreamsRef,
      lastStreamActivityRef,
      setActiveStreams,
      onStreamFinished: markStreamFinished,
      appendStreamChunk: streamHandlers.appendStreamChunk,
      onStreamChunk,
      appendToAssistant: streamHandlers.appendToAssistant,
      flushMessageText: streamHandlers.flushMessageText,
      appendQueuedMessages: streamHandlers.appendQueuedMessages,
      removeQueuedMessage: (id, chatId) =>
        queuedMessageRemoverRef.current(id, chatId),
      updateRunMetrics: (id, metrics) =>
        streamHandlers.updateRunMetrics(request.chatId, id, metrics),
    });
  }

  function attachStream(
    chatId: string,
    targetMessageId: string,
    afterSequence?: number,
  ) {
    attachStreamAction({
      chatId,
      targetMessageId,
      afterSequence,
      portRefs,
      activeStreamsRef,
      lastStreamActivityRef,
      setActiveStreams,
      onStreamFinished: markStreamFinished,
      appendStreamChunk: streamHandlers.appendStreamChunk,
      onStreamChunk,
      appendToAssistant: streamHandlers.appendToAssistant,
      flushMessageText: streamHandlers.flushMessageText,
      appendQueuedMessages: streamHandlers.appendQueuedMessages,
      removeQueuedMessage: (id, chatId) =>
        queuedMessageRemoverRef.current(id, chatId),
      updateRunMetrics: (id, metrics) =>
        streamHandlers.updateRunMetrics(chatId, id, metrics),
    });
  }

  function beginStream(chatId: string, assistantMessageId: string) {
    setActiveStreams((items) => ({
      ...items,
      [chatId]: {
        chatId,
        assistantMessageId,
        retryCount: 0,
        hasProgress: false,
      },
    }));
    lastStreamActivityRef.current[chatId] = Date.now();
  }

  function abortChatStream(chatId: string) {
    if (activeStreams[chatId]) {
      closeStreamPort(portRefs, chatId, true);
      setActiveStreams((items) => {
        const next = { ...items };
        delete next[chatId];
        return next;
      });
    }
  }

  function abortClosedChatStreams(chatId: string) {
    const ids = closedChatIds(chatsRef.current, chatId);
    ids.forEach((id) => {
      if (!activeStreamsRef.current[id]) return;
      closeStreamPort(portRefs, id, true);
    });
    setActiveStreams((items) =>
      Object.fromEntries(Object.entries(items).filter(([id]) => !ids.has(id))),
    );
    return ids;
  }

  function stopCurrentStream() {
    if (!currentChat) return;
    const activeStream = activeStreams[currentChat.id];
    if (activeStream)
      streamHandlers.updateRunMetrics(
        activeStream.chatId,
        activeStream.assistantMessageId,
        { endedAt: Date.now() },
      );
    abortChatStream(currentChat.id);
  }

  function postQueuedMessage(chatId: string, id: string, content: string) {
    portRefs.current[chatId]?.postMessage({
      type: STREAM_REQUEST.queueMessage,
      id,
      content,
    });
  }

  function deleteQueuedStreamMessage(chatId: string, id: string) {
    portRefs.current[chatId]?.postMessage({
      type: STREAM_REQUEST.deleteQueuedMessage,
      id,
    });
  }

  function setQueuedMessageRemover(
    remover: (id: string, chatId: string) => void,
  ) {
    queuedMessageRemoverRef.current = remover;
  }

  function markStreamFinished(chatId: string) {
    if (activeChatIdRef.current === chatId) return;
    setUnreadCompletedChats((items) => ({ ...items, [chatId]: true }));
  }

  return {
    streaming,
    currentChatStreaming,
    currentAssistantMessageId,
    beginStream,
    startStream,
    abortChatStream,
    abortClosedChatStreams,
    stopCurrentStream,
    postQueuedMessage,
    deleteQueuedStreamMessage,
    setQueuedMessageRemover,
  };
}

function resumableAssistantMessage(chat: Chat) {
  return [...chat.messages].reverse().find((message) => {
    const metrics = message.metadata?.runMetrics as
      | { startedAt?: unknown; endedAt?: unknown }
      | undefined;
    return (
      message.role === "assistant" &&
      metrics?.startedAt !== undefined &&
      metrics.endedAt === undefined
    );
  });
}

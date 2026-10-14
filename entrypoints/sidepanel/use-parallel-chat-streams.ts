import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type {
  Agent,
  Chat,
  ChatSummary,
  Preferences,
  RunMetrics,
  SendMessagesRequest,
  QuestionToolAnswer,
  UploadedAttachment,
} from "../../src/shared/types";
import { AI_STREAM_REQUEST_TYPE as STREAM_REQUEST } from "../../src/shared/types";
import { abortChatStreams } from "../../src/shared/chat-stream-control";
import { RUN_STOP_REASON } from "../../src/shared/run-stop";
import { createStreamHandlers } from "./stream-handlers";
import type { ActiveStreamMap } from "./sidepanel-menu-state";
import { useAutoRetryStream } from "./sidepanel-effects";
import { closedChatIds } from "./chat-state-actions";
import type { ChatUpdater } from "./use-chats";
import { resumableAssistantMessage, type StoppedRuns } from "./run-state";
import {
  attachStreamAction,
  closeStreamPort,
  startStreamAction,
  stopStreamPort,
} from "./stream-port";

export function useParallelChatStreams({
  activeChatId,
  currentChat,
  summariesRef,
  getChat,
  preferences,
  language,
  uploadedAttachments,
  agent,
  updateChat,
  setUnreadCompletedChats,
}: {
  activeChatId?: string;
  currentChat?: Chat;
  summariesRef: RefObject<ChatSummary[] | undefined>;
  getChat: (chatId: string) => Chat | undefined;
  preferences?: Preferences;
  language: string | undefined;
  uploadedAttachments: UploadedAttachment[];
  agent: Agent;
  updateChat: ChatUpdater;
  setUnreadCompletedChats: Dispatch<SetStateAction<Record<string, true>>>;
}) {
  const [activeStreams, setActiveStreamsState] = useState<ActiveStreamMap>({});
  const [stoppedRuns, setStoppedRuns] = useState<StoppedRuns>(
    () => new Set<string>(),
  );
  const portRefs = useRef<Record<string, chrome.runtime.Port | undefined>>({});
  const activeChatIdRef = useRef<string | undefined>(undefined);
  const queuedMessageRemoverRef = useRef<(id: string, chatId: string) => void>(
    () => undefined,
  );
  const lastStreamActivityRef = useRef<Record<string, number>>({});
  const activeStreamsRef = useRef<ActiveStreamMap>({});
  const streamHandlers = useMemo(
    () => createStreamHandlers(updateChat),
    [updateChat],
  );
  const setActiveStreams: typeof setActiveStreamsState = useCallback(
    (value) => {
      const next =
        typeof value === "function" ? value(activeStreamsRef.current) : value;
      activeStreamsRef.current = next;
      setActiveStreamsState(next);
    },
    [],
  );
  const streaming = Object.keys(activeStreams).length > 0;
  const currentChatStreaming = !!(currentChat && activeStreams[currentChat.id]);
  const currentAssistantMessageId = currentChat
    ? activeStreams[currentChat.id]?.assistantMessageId
    : undefined;

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useAutoRetryStream({
    streaming,
    autoRetry: preferences?.autoRetry,
    activeStreamsRef,
    lastStreamActivityRef,
    getChat,
    preferences,
    language,
    uploadedAttachments,
    agent,
    appendToAssistant: streamHandlers.appendToAssistant,
    startStream,
  });

  useEffect(() => {
    if (!currentChat || activeStreams[currentChat.id]) return;
    const message = resumableAssistantMessage(currentChat, stoppedRuns);
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
  }, [activeStreams, currentChat, setActiveStreams, stoppedRuns]);

  function startStream(request: SendMessagesRequest, targetMessageId: string) {
    startStreamAction({
      request,
      targetMessageId,
      portRefs,
      activeStreamsRef,
      lastStreamActivityRef,
      setActiveStreams,
      onStreamFinished: markStreamFinished,
      onRunStopped: markRunStopped,
      appendStreamChunk: streamHandlers.appendStreamChunk,
      endRun: streamHandlers.endRun,
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
      onRunStopped: markRunStopped,
      appendStreamChunk: streamHandlers.appendStreamChunk,
      endRun: streamHandlers.endRun,
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
      stopStreamPort(portRefs, chatId);
      setActiveStreams((items) => {
        const next = { ...items };
        delete next[chatId];
        return next;
      });
    }
  }

  async function abortClosedChatStreams(chatId: string) {
    const ids = closedChatIds(summariesRef.current || [], chatId);
    try {
      await abortChatStreams(ids);
    } finally {
      // Also abort over each port, in case the background never acknowledged.
      ids.forEach((id) => closeStreamPort(portRefs, id, true));
      setActiveStreams((items) =>
        Object.fromEntries(
          Object.entries(items).filter(([id]) => !ids.has(id)),
        ),
      );
    }
    return ids;
  }

  function stopCurrentStream() {
    if (!currentChat) return;
    const activeStream = activeStreams[currentChat.id];
    if (activeStream)
      streamHandlers.endRun(
        activeStream.chatId,
        activeStream.assistantMessageId,
        { endedAt: Date.now(), stopReason: RUN_STOP_REASON.aborted },
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

  function answerQuestion(
    chatId: string,
    toolCallId: string,
    answers: QuestionToolAnswer[],
  ) {
    portRefs.current[chatId]?.postMessage({
      type: STREAM_REQUEST.answerQuestion,
      toolCallId,
      answers,
    });
  }

  function setQueuedMessageRemover(
    remover: (id: string, chatId: string) => void,
  ) {
    queuedMessageRemoverRef.current = remover;
  }

  function markRunStopped(_chatId: string, messageId: string) {
    setStoppedRuns((items) => new Set(items).add(messageId));
  }

  function markStreamFinished(chatId: string) {
    if (activeChatIdRef.current === chatId) return;
    setUnreadCompletedChats((items) => ({ ...items, [chatId]: true }));
  }

  return {
    streaming,
    streamingChatIds: Object.keys(activeStreams),
    stoppedRuns,
    currentChatStreaming,
    currentAssistantMessageId,
    beginStream,
    startStream,
    abortChatStream,
    abortClosedChatStreams,
    stopCurrentStream,
    postQueuedMessage,
    deleteQueuedStreamMessage,
    answerQuestion,
    setQueuedMessageRemover,
  };
}

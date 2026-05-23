import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  AI_STREAM_PORT_NAME,
  AI_STREAM_REQUEST_TYPE,
  type AiStreamRequest,
  type AiStreamResponse,
  type RunMetrics,
  type SendMessagesRequest,
} from "../../src/shared/types";
import type { ActiveStreamMap } from "./sidepanel-menu-state";

export function closeStreamPort(
  portRefs: MutableRefObject<Record<string, chrome.runtime.Port | undefined>>,
  chatId: string,
  abort: boolean,
) {
  const port = portRefs.current[chatId];
  delete portRefs.current[chatId];
  if (!port) return;
  try {
    if (abort)
      port.postMessage({
        type: AI_STREAM_REQUEST_TYPE.abort,
      } satisfies AiStreamRequest);
  } catch {
    // Port may already be closed.
  }
  try {
    port.disconnect();
  } catch {
    return;
  }
}

export function startStreamAction({
  request,
  targetMessageId,
  ...options
}: Omit<StreamPortOptions, "chatId"> & {
  request: SendMessagesRequest;
}) {
  const port = connectStreamPort({
    chatId: request.chatId,
    targetMessageId,
    ...options,
  });
  postStreamRequest(port, request, { ...options, chatId: request.chatId });
}

export function attachStreamAction({
  chatId,
  targetMessageId,
  afterSequence,
  ...options
}: StreamPortOptions & {
  chatId: string;
  afterSequence?: number;
}) {
  const port = connectStreamPort({ chatId, targetMessageId, ...options });
  postStreamRequest(
    port,
    {
      type: AI_STREAM_REQUEST_TYPE.attachStream,
      chatId,
      messageId: targetMessageId,
      afterSequence,
    },
    { ...options, chatId },
  );
}

type StreamPortOptions = {
  targetMessageId: string;
  chatId: string;
  portRefs: MutableRefObject<Record<string, chrome.runtime.Port | undefined>>;
  activeStreamsRef: MutableRefObject<ActiveStreamMap>;
  lastStreamActivityRef: MutableRefObject<Record<string, number>>;
  setActiveStreams: Dispatch<SetStateAction<ActiveStreamMap>>;
  onStreamFinished: (chatId: string) => void;
  appendStreamChunk: (
    chatId: string,
    messageId: string,
    chunk: unknown,
  ) => void;
  onStreamChunk?: (event: {
    chatId: string;
    messageId: string;
    chunk: unknown;
  }) => void;
  appendToAssistant: (
    chatId: string,
    messageId: string,
    content: string,
  ) => void;
  flushMessageText: (chatId: string, messageId: string) => void;
  updateRunMetrics: (messageId: string, metrics: Partial<RunMetrics>) => void;
  appendQueuedMessages: (
    chatId: string,
    messages: Array<{ id: string; content: string; createdAt: number }>,
    assistantMessageId: string,
    createdAt: number,
  ) => void;
  removeQueuedMessage: (id: string, chatId: string) => void;
};

function connectStreamPort({
  chatId,
  targetMessageId,
  portRefs,
  activeStreamsRef,
  lastStreamActivityRef,
  setActiveStreams,
  onStreamFinished,
  appendStreamChunk,
  onStreamChunk,
  appendToAssistant,
  flushMessageText,
  updateRunMetrics,
  appendQueuedMessages,
  removeQueuedMessage,
}: StreamPortOptions) {
  closeStreamPort(portRefs, chatId, false);
  const port = chrome.runtime.connect({ name: AI_STREAM_PORT_NAME });
  portRefs.current[chatId] = port;
  let activeMessageId = targetMessageId;
  let settled = false;

  function updateActiveStream(
    updater: (stream: ActiveStreamMap[string]) => ActiveStreamMap[string],
  ) {
    setActiveStreams((items) => {
      const current = items[chatId];
      if (!current) return items;
      const nextStream = updater(current);
      const next = { ...items, [chatId]: nextStream };
      activeStreamsRef.current = next;
      return next;
    });
  }

  function clearActiveStream() {
    settled = true;
    setActiveStreams((items) => {
      if (!items[chatId]) return items;
      const next = { ...items };
      delete next[chatId];
      activeStreamsRef.current = next;
      return next;
    });
    closeStreamPort(portRefs, chatId, false);
  }

  port.onDisconnect.addListener(() => {
    if (portRefs.current[chatId] === port) delete portRefs.current[chatId];
    flushMessageText(chatId, activeMessageId);
    if (!settled) clearActiveStream();
  });

  function scheduleSequenceMetrics(metrics: Partial<RunMetrics> | undefined) {
    if (!metrics) return;
    updateRunMetrics(activeMessageId, metrics);
  }

  port.onMessage.addListener((message: AiStreamResponse) => {
    lastStreamActivityRef.current[chatId] = Date.now();
    const sequenceMetrics = message.sequence
      ? { streamEventIndex: message.sequence }
      : undefined;
    if (message.type === "queuedMessages") {
      updateRunMetrics(activeMessageId, { endedAt: message.createdAt });
      appendQueuedMessages(
        chatId,
        message.messages,
        message.assistantMessageId,
        message.createdAt,
      );
      message.messages.forEach((item) => removeQueuedMessage(item.id, chatId));
      activeMessageId = message.assistantMessageId;
      updateActiveStream((stream) => ({
        ...stream,
        assistantMessageId: activeMessageId,
      }));
      scheduleSequenceMetrics(sequenceMetrics);
      return;
    }
    if (message.type === "chunk") {
      updateActiveStream((stream) => ({ ...stream, hasProgress: true }));
      appendStreamChunk(chatId, activeMessageId, message.chunk);
      onStreamChunk?.({
        chatId,
        messageId: activeMessageId,
        chunk: message.chunk,
      });
    }
    scheduleSequenceMetrics(sequenceMetrics);
    if (message.type === "metrics") {
      updateRunMetrics(activeMessageId, message.metrics);
    }
    if (message.type === "error") {
      flushMessageText(chatId, activeMessageId);
      updateRunMetrics(activeMessageId, { endedAt: Date.now() });
      appendToAssistant(chatId, activeMessageId, `\n\n${message.error}`);
      clearActiveStream();
      onStreamFinished(chatId);
    }
    if (message.type === "end") {
      flushMessageText(chatId, activeMessageId);
      updateRunMetrics(activeMessageId, { endedAt: Date.now() });
      clearActiveStream();
      onStreamFinished(chatId);
    }
  });
  return port;
}

function postStreamRequest(
  port: chrome.runtime.Port,
  request: AiStreamRequest,
  options: Pick<
    StreamPortOptions,
    "activeStreamsRef" | "chatId" | "portRefs" | "setActiveStreams"
  >,
) {
  try {
    port.postMessage(request);
  } catch {
    if (options.portRefs.current[options.chatId] === port)
      delete options.portRefs.current[options.chatId];
    options.setActiveStreams((items) => {
      const next = { ...items };
      delete next[options.chatId];
      options.activeStreamsRef.current = next;
      return next;
    });
  }
}

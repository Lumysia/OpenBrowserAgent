import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  STREAM_RENDER_THROTTLE_MS,
  STREAM_STOP_SETTLE_MS,
} from "../../src/shared/config";
import {
  AI_STREAM_PORT_NAME,
  AI_STREAM_REQUEST_TYPE,
  type AiStreamRequest,
  type AiStreamResponse,
  type RunMetrics,
  type SendMessagesRequest,
} from "../../src/shared/types";
import type { ActiveStreamMap } from "./sidepanel-menu-state";
import type { RunEnd } from "./stream-handlers";

// Ports of runs the user stopped. Each keeps listening until its run
// settles, for the usage of the run's last request.
const stoppingPorts = new WeakMap<chrome.runtime.Port, () => void>();

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

// Stops the chat's run. Its port no longer serves the chat, but stays open
// until the run reports its end.
export function stopStreamPort(
  portRefs: MutableRefObject<Record<string, chrome.runtime.Port | undefined>>,
  chatId: string,
) {
  const port = portRefs.current[chatId];
  const settle = port && stoppingPorts.get(port);
  if (!settle) return closeStreamPort(portRefs, chatId, true);
  delete portRefs.current[chatId];
  try {
    port.postMessage({
      type: AI_STREAM_REQUEST_TYPE.abort,
    } satisfies AiStreamRequest);
  } catch {
    // The port is already closed; settle() disconnects it.
  }
  settle();
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
  // The background has no run of this reply: the panel shows it as over
  // and stores nothing, since nothing about the reply changed.
  onRunStopped: (chatId: string, messageId: string) => void;
  appendStreamChunk: (
    chatId: string,
    messageId: string,
    chunk: unknown,
    metrics?: Partial<RunMetrics>,
  ) => void;
  endRun: (chatId: string, messageId: string, end: RunEnd) => void;
  flushMessageText: (chatId: string, messageId: string) => void;
  updateRunMetrics: (
    messageId: string,
    metrics: Partial<RunMetrics>,
    options?: { flushPendingText?: boolean },
  ) => void;
  appendQueuedMessages: (
    chatId: string,
    messages: Array<{ id: string; content: string; createdAt: number }>,
    assistantMessageId: string,
    createdAt: number,
    sequence?: number,
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
  onRunStopped,
  appendStreamChunk,
  endRun,
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
  let pendingSequenceMetrics:
    { messageId: string; metrics: Partial<RunMetrics> } | undefined;
  let sequenceMetricsTimeout: number | undefined;
  let stopping = false;
  let stopTimeout: number | undefined;

  function finishStopping() {
    settled = true;
    window.clearTimeout(stopTimeout);
    try {
      port.disconnect();
    } catch {
      // Already closed.
    }
  }

  stoppingPorts.set(port, () => {
    flushSequenceMetrics();
    flushMessageText(chatId, activeMessageId);
    stopping = true;
    stopTimeout = window.setTimeout(finishStopping, STREAM_STOP_SETTLE_MS);
  });

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
    if (portRefs.current[chatId] !== port) return;
    setActiveStreams((items) => {
      if (!items[chatId]) return items;
      const next = { ...items };
      delete next[chatId];
      activeStreamsRef.current = next;
      return next;
    });
    closeStreamPort(portRefs, chatId, false);
  }

  function flushSequenceMetrics() {
    if (sequenceMetricsTimeout !== undefined) {
      window.clearTimeout(sequenceMetricsTimeout);
      sequenceMetricsTimeout = undefined;
    }
    const item = pendingSequenceMetrics;
    pendingSequenceMetrics = undefined;
    if (!item || portRefs.current[chatId] !== port) return;
    updateRunMetrics(item.messageId, item.metrics, { flushPendingText: false });
  }

  port.onDisconnect.addListener(() => {
    window.clearTimeout(stopTimeout);
    flushSequenceMetrics();
    if (portRefs.current[chatId] !== port) return;
    flushMessageText(chatId, activeMessageId);
    if (!settled) clearActiveStream();
  });

  function scheduleSequenceMetrics(metrics: Partial<RunMetrics> | undefined) {
    if (!metrics) return;
    pendingSequenceMetrics = { messageId: activeMessageId, metrics };
    if (sequenceMetricsTimeout !== undefined) return;
    sequenceMetricsTimeout = window.setTimeout(
      flushSequenceMetrics,
      STREAM_RENDER_THROTTLE_MS,
    );
  }

  port.onMessage.addListener((message: AiStreamResponse) => {
    if (settled) return;
    if (stopping) {
      // The reply stays as the user stopped it; only its usage still counts.
      if (message.type === "metrics") {
        const { stopReason: _stopReason, ...usage } = message.metrics;
        updateRunMetrics(activeMessageId, usage);
      } else if (message.type !== "chunk") finishStopping();
      return;
    }
    if (portRefs.current[chatId] !== port) return;
    lastStreamActivityRef.current[chatId] = Date.now();
    const sequenceMetrics = message.sequence
      ? { streamEventIndex: message.sequence }
      : undefined;
    if (message.type === "notRunning") {
      clearActiveStream();
      onRunStopped(chatId, activeMessageId);
      return;
    }
    if (message.type === "queuedMessages") {
      flushSequenceMetrics();
      flushMessageText(chatId, activeMessageId);
      updateRunMetrics(activeMessageId, { endedAt: message.createdAt });
      appendQueuedMessages(
        chatId,
        message.messages,
        message.assistantMessageId,
        message.createdAt,
        message.sequence,
      );
      message.messages.forEach((item) => removeQueuedMessage(item.id, chatId));
      activeMessageId = message.assistantMessageId;
      updateActiveStream((stream) => ({
        ...stream,
        assistantMessageId: activeMessageId,
      }));
      return;
    }
    if (message.type === "chunk") {
      updateActiveStream((stream) =>
        stream.hasProgress ? stream : { ...stream, hasProgress: true },
      );
      appendStreamChunk(
        chatId,
        activeMessageId,
        message.chunk,
        sequenceMetrics,
      );
      return;
    }
    if (message.type === "metrics") {
      scheduleSequenceMetrics(sequenceMetrics);
      updateRunMetrics(activeMessageId, message.metrics);
    }
    if (message.type === "error" || message.type === "end") {
      flushSequenceMetrics();
      endRun(chatId, activeMessageId, {
        endedAt: Date.now(),
        ...sequenceMetrics,
        ...(message.type === "error"
          ? { error: message.error }
          : message.stopReason
            ? { stopReason: message.stopReason }
            : {}),
      });
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

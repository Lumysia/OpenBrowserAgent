import type { MutableRefObject } from "react";
import {
  AI_STREAM_PORT_NAME,
  AI_STREAM_REQUEST_TYPE,
  type AiStreamResponse,
  type AiStreamRequest,
  type RunMetrics,
  type SendMessagesRequest,
} from "../../src/shared/types";
import type { ActiveStream } from "./sidepanel-menu-state";

export function closeStreamPort(
  portRef: MutableRefObject<chrome.runtime.Port | undefined>,
  abort: boolean,
) {
  const port = portRef.current;
  portRef.current = undefined;
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
  portRef,
  activeStreamRef,
  lastStreamActivityRef,
  setStreaming,
  appendStreamChunk,
  appendToAssistant,
  updateRunMetrics,
}: {
  request: SendMessagesRequest;
  targetMessageId: string;
  portRef: MutableRefObject<chrome.runtime.Port | undefined>;
  activeStreamRef: MutableRefObject<ActiveStream | null>;
  lastStreamActivityRef: MutableRefObject<number>;
  setStreaming: (value: boolean) => void;
  appendStreamChunk: (
    chatId: string,
    messageId: string,
    chunk: unknown,
  ) => void;
  appendToAssistant: (
    chatId: string,
    messageId: string,
    content: string,
  ) => void;
  updateRunMetrics: (metrics: Partial<RunMetrics>) => void;
}) {
  closeStreamPort(portRef, false);
  const port = chrome.runtime.connect({ name: AI_STREAM_PORT_NAME });
  portRef.current = port;
  port.onMessage.addListener((message: AiStreamResponse) => {
    lastStreamActivityRef.current = Date.now();
    if (message.type === "chunk") {
      if (activeStreamRef.current?.assistantMessageId === targetMessageId)
        activeStreamRef.current.hasProgress = true;
      appendStreamChunk(request.chatId, targetMessageId, message.chunk);
    }
    if (message.type === "metrics") updateRunMetrics(message.metrics);
    if (message.type === "error") {
      activeStreamRef.current = null;
      updateRunMetrics({ endedAt: Date.now() });
      setStreaming(false);
      appendToAssistant(
        request.chatId,
        targetMessageId,
        `\n\n${message.error}`,
      );
    }
    if (message.type === "end") {
      activeStreamRef.current = null;
      updateRunMetrics({ endedAt: Date.now() });
      setStreaming(false);
    }
  });
  try {
    port.postMessage(request);
  } catch {
    if (portRef.current === port) portRef.current = undefined;
    activeStreamRef.current = null;
    setStreaming(false);
  }
}

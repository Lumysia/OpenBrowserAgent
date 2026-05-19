import {
  AI_STREAM_PORT_NAME,
  AI_STREAM_REQUEST_TYPE,
} from "../../src/shared/types";
import type { Dispatch, SetStateAction } from "react";
import type {
  AiStreamRequest,
  AiStreamResponse,
  Chat,
} from "../../src/shared/types";

export function requestGeneratedTitle({
  modelId,
  message,
  onTitle,
}: {
  modelId?: string;
  message: string;
  onTitle: (title: string) => void;
}) {
  const port = chrome.runtime.connect({ name: AI_STREAM_PORT_NAME });
  const cleanup = createPortCleanup(port);
  port.onMessage.addListener((response: AiStreamResponse) => {
    if (response.type === "title") {
      const title = response.title.trim();
      if (title) onTitle(title);
      cleanup();
    }
    if (response.type === "error") cleanup();
  });
  try {
    port.postMessage({
      type: AI_STREAM_REQUEST_TYPE.generateTitle,
      modelId,
      message,
    } satisfies AiStreamRequest);
  } catch {
    cleanup();
  }
}

export function requestChatTitle({
  chatId,
  modelId,
  message,
  setChats,
}: {
  chatId: string;
  modelId?: string;
  message: string;
  setChats: Dispatch<SetStateAction<Chat[]>>;
}) {
  requestGeneratedTitle({
    modelId,
    message,
    onTitle: (title) =>
      setChats((items) =>
        items.map((chat) => (chat.id === chatId ? { ...chat, title } : chat)),
      ),
  });
}

function createPortCleanup(port: chrome.runtime.Port) {
  return () => {
    try {
      port.disconnect();
    } catch {
      // Best-effort cleanup for stale ports.
    }
  };
}

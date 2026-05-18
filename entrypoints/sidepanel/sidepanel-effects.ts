import { useEffect, useLayoutEffect } from "react";
import type { RefObject } from "react";
import {
  AUTO_RETRY_IDLE_MS,
  AUTO_RETRY_POLL_MS,
  MAX_AUTO_RETRIES,
} from "../../src/shared/config";
import type {
  Chat,
  ChatMode,
  Agent,
  Preferences,
  UploadedAttachment,
} from "../../src/shared/types";
import { sortChatsNewestFirst } from "./format";
import { retryStalledStream } from "./retry-stalled-stream";
import type { ActiveStream } from "./sidepanel-menu-state";
import type { SendMessagesRequest } from "../../src/shared/types";

export function useSidepanelTheme(
  accentColor: string | undefined,
  colorScheme: string | undefined,
) {
  useEffect(() => {
    document.documentElement.dataset.accent = accentColor || "pink";
    document.documentElement.dataset.theme = colorScheme || "system";
  }, [accentColor, colorScheme]);
}

export function useAutoScroll(
  messagesRef: RefObject<HTMLDivElement | null>,
  messages: Chat["messages"] | undefined,
  autoScroll: boolean | undefined,
  streaming: boolean,
) {
  useLayoutEffect(() => {
    if (autoScroll === false) return;
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;
    messagesElement.scrollTo({
      top: messagesElement.scrollHeight,
      behavior: streaming ? "auto" : "smooth",
    });
  }, [messages, autoScroll, streaming]);
}

export function useChatSelection(
  chats: Chat[] | undefined,
  activeChatId: string | undefined,
  initializedChatSelectionRef: RefObject<boolean>,
  setActiveChatId: (chatId: string | undefined) => void,
  createChat: () => Chat,
) {
  useEffect(() => {
    if (!chats) return;
    if (!chats.length) {
      createChat();
      return;
    }
    if (!initializedChatSelectionRef.current) {
      initializedChatSelectionRef.current = true;
      const emptyChat = [...chats]
        .reverse()
        .find((chat) => !chat.messages.length);
      if (emptyChat) setActiveChatId(emptyChat.id);
      else createChat();
      return;
    }
    if (!activeChatId || !chats.some((chat) => chat.id === activeChatId))
      setActiveChatId(sortChatsNewestFirst(chats)[0]?.id);
  }, [
    activeChatId,
    chats,
    createChat,
    initializedChatSelectionRef,
    setActiveChatId,
  ]);
}

export function useActiveChatCleanup(
  activeChatId: string | undefined,
  clearUploadedAttachments: () => void,
  setEditingMessage: (value: null) => void,
  setSentAttachmentPreviews: (
    value: Record<string, UploadedAttachment[]>,
  ) => void,
) {
  useEffect(() => {
    clearUploadedAttachments();
    setEditingMessage(null);
    setSentAttachmentPreviews({});
  }, [activeChatId]);
}

export function useAutoRetryStream({
  streaming,
  autoRetry,
  activeStreamRef,
  lastStreamActivityRef,
  chatsRef,
  preferences,
  mode,
  language,
  uploadedAttachments,
  agent,
  appendToAssistant,
  startStream,
}: {
  streaming: boolean;
  autoRetry: boolean | undefined;
  activeStreamRef: RefObject<ActiveStream | null>;
  lastStreamActivityRef: RefObject<number>;
  chatsRef: RefObject<Chat[]>;
  preferences: Preferences | undefined;
  mode: ChatMode;
  language: string | undefined;
  uploadedAttachments: UploadedAttachment[];
  agent?: Agent;
  appendToAssistant: (
    chatId: string,
    messageId: string,
    content: string,
  ) => void;
  startStream: (request: SendMessagesRequest, targetMessageId: string) => void;
}) {
  useEffect(() => {
    if (!streaming || autoRetry === false) return;
    const interval = window.setInterval(() => {
      const active = activeStreamRef.current;
      if (!active || active.retryCount >= MAX_AUTO_RETRIES) return;
      if (active.hasProgress) return;
      if (Date.now() - lastStreamActivityRef.current < AUTO_RETRY_IDLE_MS)
        return;
      lastStreamActivityRef.current = Date.now();
      retryStalledStream({
        active,
        chats: chatsRef.current,
        preferences,
        mode,
        language: language || "en-US",
        uploadedAttachments,
        agent,
        appendToAssistant,
        startStream,
      });
    }, AUTO_RETRY_POLL_MS);
    return () => window.clearInterval(interval);
  }, [autoRetry, streaming]);
}

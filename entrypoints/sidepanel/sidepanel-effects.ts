import { useEffect, useLayoutEffect, useRef } from "react";
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

const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 36;

export function useSidepanelTheme(
  accentColor: string | undefined,
  colorScheme: string | undefined,
) {
  useLayoutEffect(() => {
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
  const shouldStickToBottomRef = useRef(true);
  const lastScrollHeightRef = useRef(0);

  useEffect(() => {
    if (autoScroll === false) return undefined;
    const messagesElement = messagesRef.current;
    if (!messagesElement) return undefined;
    const updateStickyState = () => {
      shouldStickToBottomRef.current = isNearScrollBottom(messagesElement);
      lastScrollHeightRef.current = messagesElement.scrollHeight;
    };
    updateStickyState();
    messagesElement.addEventListener("scroll", updateStickyState, {
      passive: true,
    });
    return () =>
      messagesElement.removeEventListener("scroll", updateStickyState);
  }, [autoScroll, messagesRef]);

  useLayoutEffect(() => {
    if (autoScroll === false) return;
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;
    if (messagesElement.scrollHeight < lastScrollHeightRef.current)
      shouldStickToBottomRef.current = true;
    if (!shouldStickToBottomRef.current) return;
    messagesElement.scrollTo({
      top: messagesElement.scrollHeight,
      behavior: streaming ? "auto" : "smooth",
    });
    lastScrollHeightRef.current = messagesElement.scrollHeight;
  }, [messages, autoScroll, streaming]);
}

function isNearScrollBottom(element: HTMLElement) {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    AUTO_SCROLL_BOTTOM_THRESHOLD_PX
  );
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
      if (activeChatId) return;
      createChat();
      return;
    }
    if (!initializedChatSelectionRef.current) {
      initializedChatSelectionRef.current = true;
      createChat();
      return;
    }
    if (!activeChatId) setActiveChatId(sortChatsNewestFirst(chats)[0]?.id);
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

import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import {
  AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
  AUTO_SCROLL_STREAM_THROTTLE_MS,
  AUTO_RETRY_IDLE_MS,
  AUTO_RETRY_POLL_MS,
  MAX_AUTO_RETRIES,
} from "../../src/shared/config";
import type {
  Agent,
  Chat,
  Preferences,
  SelectedElement,
  Skill,
  UploadedAttachment,
} from "../../src/shared/types";
import { sortChatsNewestFirst } from "./format";
import { retryStalledStream } from "./retry-stalled-stream";
import type { ActiveStreamMap, ComposerMenu } from "./sidepanel-menu-state";
import type { SendMessagesRequest } from "../../src/shared/types";

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
  activeChatId: string | undefined,
  chatSelectionRequestId: number,
) {
  const stickToBottomRef = useRef(true);
  const previousChatIdRef = useRef<string | undefined>(undefined);
  const previousSelectionRequestIdRef = useRef(chatSelectionRequestId);
  const previousStreamingRef = useRef(false);
  const boundElementRef = useRef<HTMLDivElement | null>(null);
  const unbindElementRef = useRef<(() => void) | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  const lastStreamScrollAtRef = useRef(0);

  function bindScrollElement(element: HTMLDivElement) {
    if (boundElementRef.current === element) return;
    unbindElementRef.current?.();
    boundElementRef.current = element;

    function updateStickToBottom() {
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distanceFromBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX) {
        stickToBottomRef.current = true;
      }
    }

    function handleWheel(event: WheelEvent) {
      if (event.deltaY >= 0) return;
      stickToBottomRef.current = false;
    }

    function handleDocumentWheel(event: WheelEvent) {
      if (event.deltaY >= 0) return;
      if (!element.contains(event.target as Node | null)) return;
      stickToBottomRef.current = false;
    }

    function handlePointerDown() {
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distanceFromBottom > AUTO_SCROLL_BOTTOM_THRESHOLD_PX) {
        stickToBottomRef.current = false;
      }
    }

    updateStickToBottom();
    element.addEventListener("scroll", updateStickToBottom, {
      passive: true,
    });
    element.addEventListener("wheel", handleWheel, { passive: true });
    element.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: true,
    });
    document.addEventListener("wheel", handleDocumentWheel, {
      capture: true,
      passive: true,
    });
    element.addEventListener("pointerdown", handlePointerDown, {
      passive: true,
    });
    unbindElementRef.current = () => {
      element.removeEventListener("scroll", updateStickToBottom);
      element.removeEventListener("wheel", handleWheel);
      element.removeEventListener("wheel", handleWheel, { capture: true });
      document.removeEventListener("wheel", handleDocumentWheel, {
        capture: true,
      });
      element.removeEventListener("pointerdown", handlePointerDown);
      if (boundElementRef.current === element) boundElementRef.current = null;
    };
  }

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (messagesElement) bindScrollElement(messagesElement);
    return () => unbindElementRef.current?.();
  }, [messagesRef]);

  useEffect(
    () => () => {
      if (frameRef.current !== undefined)
        cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    if (autoScroll === false) return;
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;
    bindScrollElement(messagesElement);

    const chatChanged = previousChatIdRef.current !== activeChatId;
    const chatSelectionRequested =
      previousSelectionRequestIdRef.current !== chatSelectionRequestId;
    const streamingStarted = streaming && !previousStreamingRef.current;
    previousSelectionRequestIdRef.current = chatSelectionRequestId;
    previousStreamingRef.current = streaming;
    if (chatChanged || chatSelectionRequested || streamingStarted) {
      previousChatIdRef.current = activeChatId;
      stickToBottomRef.current = true;
    }

    if (streaming && !stickToBottomRef.current) {
      return;
    }
    const now = performance.now();
    if (
      streaming &&
      now - lastStreamScrollAtRef.current < AUTO_SCROLL_STREAM_THROTTLE_MS
    ) {
      return;
    }

    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    lastStreamScrollAtRef.current = now;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = undefined;
      const distanceFromBottom =
        messagesElement.scrollHeight -
        messagesElement.scrollTop -
        messagesElement.clientHeight;
      if (streaming && distanceFromBottom <= 2) {
        return;
      }
      if (streaming && !stickToBottomRef.current) {
        return;
      }
      messagesElement.scrollTo({
        top: messagesElement.scrollHeight,
        behavior: chatChanged || chatSelectionRequested ? "auto" : "smooth",
      });
    });
  }, [messages, autoScroll, streaming, activeChatId, chatSelectionRequestId]);
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
      if (activeChatId) {
        setActiveChatId(undefined);
        return;
      }
      createChat();
      return;
    }
    if (!initializedChatSelectionRef.current) {
      initializedChatSelectionRef.current = true;
      if (activeChatId && chats.some((chat) => chat.id === activeChatId))
        return;
      createChat();
      return;
    }
    if (activeChatId && !chats.some((chat) => chat.id === activeChatId)) {
      setActiveChatId(sortChatsNewestFirst(chats)[0]?.id);
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
  clearAttachedTabs: () => void,
  setSelectedElements: (value: SelectedElement[]) => void,
  setSelectedSkills: (value: Skill[]) => void,
  setOpenMenu: (value: ComposerMenu | null) => void,
) {
  useEffect(() => {
    clearUploadedAttachments();
    setEditingMessage(null);
    setSentAttachmentPreviews({});
    clearAttachedTabs();
    setSelectedElements([]);
    setSelectedSkills([]);
    setOpenMenu(null);
  }, [activeChatId]);
}

export function useAutoRetryStream({
  streaming,
  autoRetry,
  activeStreamsRef,
  lastStreamActivityRef,
  chatsRef,
  preferences,
  language,
  uploadedAttachments,
  agent,
  appendToAssistant,
  startStream,
}: {
  streaming: boolean;
  autoRetry: boolean | undefined;
  activeStreamsRef: RefObject<ActiveStreamMap>;
  lastStreamActivityRef: RefObject<Record<string, number>>;
  chatsRef: RefObject<Chat[]>;
  preferences: Preferences | undefined;
  language: string | undefined;
  uploadedAttachments: UploadedAttachment[];
  agent: Agent;
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
      Object.values(activeStreamsRef.current).forEach((active) => {
        if (active.retryCount >= MAX_AUTO_RETRIES) return;
        if (active.hasProgress) return;
        const lastActivity = lastStreamActivityRef.current[active.chatId] || 0;
        if (Date.now() - lastActivity < AUTO_RETRY_IDLE_MS) return;
        lastStreamActivityRef.current[active.chatId] = Date.now();
        retryStalledStream({
          active,
          chats: chatsRef.current,
          preferences,
          language: language || "en-US",
          uploadedAttachments,
          agent,
          appendToAssistant,
          startStream,
        });
      });
    }, AUTO_RETRY_POLL_MS);
    return () => window.clearInterval(interval);
  }, [autoRetry, streaming]);
}

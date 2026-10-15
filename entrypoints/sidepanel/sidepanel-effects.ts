import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import {
  AUTO_SCROLL_AT_BOTTOM_PX,
  AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
  AUTO_SCROLL_SUBPIXEL_PX,
  AUTO_SCROLL_STREAM_THROTTLE_MS,
  AUTO_RETRY_IDLE_MS,
  AUTO_RETRY_POLL_MS,
  MAX_AUTO_RETRIES,
} from "../../src/shared/config";
import type {
  Chat,
  ChatSummary,
  SendMessagesBody,
} from "../../src/shared/types";
import { useLatest } from "../../src/ui/use-latest";
import { pruneEmptyChats } from "./chat-state-actions";
import { retryStalledStream } from "./retry-stalled-stream";
import type { ActiveStreamMap } from "./sidepanel-menu-state";
import type { SendMessagesRequest } from "../../src/shared/types";

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
  const previousMessagesSignatureRef = useRef<string | undefined>(undefined);
  const boundElementRef = useRef<HTMLDivElement | null>(null);
  const unbindElementRef = useRef<(() => void) | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  const lastStreamScrollAtRef = useRef(0);
  const autoScrollRef = useRef(autoScroll);
  autoScrollRef.current = autoScroll;

  function bindScrollElement(element: HTMLDivElement) {
    if (boundElementRef.current === element) return;
    unbindElementRef.current?.();
    boundElementRef.current = element;

    // Follow new output only while the reader is at the bottom. Any move up
    // (wheel, touchpad, scrollbar, keys) stops following; coming back down
    // to the bottom starts again. Our own scrolls only ever go down.
    let lastScrollTop = element.scrollTop;
    function updateStickToBottom() {
      const top = element.scrollTop;
      const fromBottom = distanceFromBottom(element);
      if (
        top < lastScrollTop - AUTO_SCROLL_SUBPIXEL_PX &&
        fromBottom > AUTO_SCROLL_AT_BOTTOM_PX
      )
        stickToBottomRef.current = false;
      else if (fromBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX)
        stickToBottomRef.current = true;
      lastScrollTop = top;
    }

    function handleDocumentWheel(event: WheelEvent) {
      if (event.deltaY >= 0) return;
      if (!element.contains(event.target as Node | null)) return;
      stickToBottomRef.current = false;
    }

    function handlePointerDown() {
      if (distanceFromBottom(element) > AUTO_SCROLL_BOTTOM_THRESHOLD_PX)
        stickToBottomRef.current = false;
    }

    updateStickToBottom();
    element.addEventListener("scroll", updateStickToBottom, {
      passive: true,
    });
    // A wheel up over the list, seen before any element can stop it.
    document.addEventListener("wheel", handleDocumentWheel, {
      capture: true,
      passive: true,
    });
    element.addEventListener("pointerdown", handlePointerDown, {
      passive: true,
    });
    // Text keeps growing after a message update (the reveal animation,
    // images, code blocks), so follow the content's size, not only updates.
    const resizeObserver = new ResizeObserver(() => {
      if (autoScrollRef.current === false || !stickToBottomRef.current) return;
      if (distanceFromBottom(element) > AUTO_SCROLL_AT_BOTTOM_PX) {
        element.scrollTop = element.scrollHeight;
        lastScrollTop = element.scrollTop;
      }
    });
    const observeContent = () => {
      resizeObserver.disconnect();
      for (const child of element.children) resizeObserver.observe(child);
    };
    observeContent();
    const childObserver = new MutationObserver(observeContent);
    childObserver.observe(element, { childList: true });
    unbindElementRef.current = () => {
      resizeObserver.disconnect();
      childObserver.disconnect();
      element.removeEventListener("scroll", updateStickToBottom);
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
    const messagesSignature = messageScrollSignature(messages);
    const messagesChanged =
      previousMessagesSignatureRef.current !== messagesSignature;
    previousSelectionRequestIdRef.current = chatSelectionRequestId;
    previousStreamingRef.current = streaming;
    previousMessagesSignatureRef.current = messagesSignature;
    if (chatChanged || chatSelectionRequested || streamingStarted) {
      previousChatIdRef.current = activeChatId;
      stickToBottomRef.current = true;
    }
    if (
      !chatChanged &&
      !chatSelectionRequested &&
      !streamingStarted &&
      !messagesChanged
    )
      return;

    // Only opening a chat or sending a message pulls the reader down.
    if (!stickToBottomRef.current) return;
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
      if (
        streaming &&
        distanceFromBottom(messagesElement) <= AUTO_SCROLL_AT_BOTTOM_PX
      )
        return;
      if (!stickToBottomRef.current) return;
      messagesElement.scrollTo({
        top: messagesElement.scrollHeight,
        behavior:
          chatChanged || chatSelectionRequested || streaming
            ? "auto"
            : "smooth",
      });
    });
  }, [messages, autoScroll, streaming, activeChatId, chatSelectionRequestId]);
}

function distanceFromBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

function messageScrollSignature(messages: Chat["messages"] | undefined) {
  if (!messages?.length) return "empty";
  const latest = messages[messages.length - 1];
  const latestParts = latest.parts || [];
  const latestPart = latestParts[latestParts.length - 1];
  const runMetrics = latest.metadata?.runMetrics as
    | {
        endedAt?: unknown;
        streamEventIndex?: unknown;
        outputCharacters?: unknown;
      }
    | undefined;
  return JSON.stringify({
    count: messages.length,
    latestId: latest.id,
    latestRole: latest.role,
    latestContentLength: latest.content.length,
    latestPartCount: latestParts.length,
    latestPart: latestPart
      ? {
          id: latestPart.id,
          type: latestPart.type,
          state: latestPart.state,
          textLength: latestPart.text?.length || 0,
          hasOutput: latestPart.output !== undefined,
          hasError: !!latestPart.error,
        }
      : undefined,
    endedAt: runMetrics?.endedAt,
    streamEventIndex: runMetrics?.streamEventIndex,
    outputCharacters: runMetrics?.outputCharacters,
  });
}

export function useChatSelection(
  chats: ChatSummary[] | undefined,
  activeChatId: string | undefined,
  draftChatId: string | undefined,
  initializedChatSelectionRef: RefObject<boolean>,
  setActiveChatId: (chatId: string | undefined) => void,
  createChat: () => Chat,
) {
  useEffect(() => {
    if (!chats) return;
    if (!chats.length) {
      if (activeChatId && activeChatId === draftChatId) return;
      if (activeChatId) {
        setActiveChatId(undefined);
        return;
      }
      createChat();
      return;
    }
    if (!initializedChatSelectionRef.current) {
      initializedChatSelectionRef.current = true;
      if (
        activeChatId &&
        (activeChatId === draftChatId ||
          chats.some((chat) => chat.id === activeChatId))
      )
        return;
      createChat();
      return;
    }
    if (activeChatId && activeChatId === draftChatId) return;
    if (activeChatId && !chats.some((chat) => chat.id === activeChatId)) {
      createChat();
      return;
    }
    if (!activeChatId) createChat();
  }, [
    activeChatId,
    chats,
    createChat,
    draftChatId,
    initializedChatSelectionRef,
    setActiveChatId,
  ]);
}

// Calls `reset` when the user moves from one chat to another (not when the
// first chat is chosen), with the panel's current state.
export function useActiveChatCleanup(
  activeChatId: string | undefined,
  reset: () => void,
) {
  const previousActiveChatIdRef = useRef<string | undefined>(undefined);
  const latestReset = useLatest(reset);

  useEffect(() => {
    const previousActiveChatId = previousActiveChatIdRef.current;
    previousActiveChatIdRef.current = activeChatId;
    if (previousActiveChatId === undefined && activeChatId !== undefined)
      return;
    if (previousActiveChatId === activeChatId) return;
    latestReset.current();
  }, [activeChatId, latestReset]);
}

// Retries a stream that shows no progress for a while. The timer reads the
// panel's current state when it fires; the retry itself sends the request
// body the stalled run started with (`bodyFor`).
export function useAutoRetryStream({
  streaming,
  autoRetry,
  activeStreamsRef,
  lastStreamActivityRef,
  getChat,
  bodyFor,
  appendToAssistant,
  startStream,
}: {
  streaming: boolean;
  autoRetry: boolean | undefined;
  activeStreamsRef: RefObject<ActiveStreamMap>;
  lastStreamActivityRef: RefObject<Record<string, number>>;
  getChat: (chatId: string) => Chat | undefined;
  bodyFor: (chatId: string) => SendMessagesBody;
  appendToAssistant: (
    chatId: string,
    messageId: string,
    content: string,
  ) => void;
  startStream: (request: SendMessagesRequest, targetMessageId: string) => void;
}) {
  const latest = useLatest({
    getChat,
    bodyFor,
    appendToAssistant,
    startStream,
  });
  useEffect(() => {
    if (!streaming || autoRetry === false) return;
    const interval = window.setInterval(() => {
      const { getChat, bodyFor, appendToAssistant, startStream } =
        latest.current;
      Object.values(activeStreamsRef.current).forEach((active) => {
        if (active.retryCount >= MAX_AUTO_RETRIES) return;
        if (active.hasProgress) return;
        const lastActivity = lastStreamActivityRef.current[active.chatId] || 0;
        if (Date.now() - lastActivity < AUTO_RETRY_IDLE_MS) return;
        lastStreamActivityRef.current[active.chatId] = Date.now();
        retryStalledStream({
          active,
          chat: getChat(active.chatId),
          body: bodyFor(active.chatId),
          appendToAssistant,
          startStream,
        });
      });
    }, AUTO_RETRY_POLL_MS);
    return () => window.clearInterval(interval);
  }, [activeStreamsRef, autoRetry, lastStreamActivityRef, latest, streaming]);
}

// Drops empty chats from history, and the composer draft once it is stored
// (or the user moved to another chat).
export function useChatListCleanup({
  chats,
  setChats,
  activeChatId,
  draftChat,
  storedCurrentChat,
  setDraftChat,
}: {
  chats: ChatSummary[] | undefined;
  setChats: (update: (items: ChatSummary[]) => ChatSummary[]) => unknown;
  activeChatId: string | undefined;
  draftChat: Chat | undefined;
  storedCurrentChat: ChatSummary | undefined;
  setDraftChat: (chat: Chat | undefined) => void;
}) {
  useEffect(() => {
    if (!chats?.some((chat) => !chat.messageCount)) return;
    setChats((items) => pruneEmptyChats(items));
  }, [chats, setChats]);

  useEffect(() => {
    if (!draftChat) return;
    if (activeChatId !== draftChat.id || storedCurrentChat)
      setDraftChat(undefined);
  }, [activeChatId, draftChat, storedCurrentChat, setDraftChat]);
}

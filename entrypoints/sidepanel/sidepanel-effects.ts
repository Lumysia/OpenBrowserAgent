import { useEffect, useLayoutEffect } from "react";
import type { RefObject } from "react";
import {
  AUTO_RETRY_IDLE_MS,
  AUTO_RETRY_POLL_MS,
  MAX_AUTO_RETRIES,
} from "../../src/shared/config";
import type {
  Agent,
  Chat,
  ChatMode,
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
      if (activeChatId) return;
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
  mode,
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
          mode,
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

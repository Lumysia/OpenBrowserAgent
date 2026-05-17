import { useEffect, useMemo, useRef, useState } from "react";
import { getActiveTab, injectElementSelector } from "../../src/shared/browser";
import {
  AUTO_RETRY_IDLE_MS,
  AUTO_RETRY_POLL_MS,
  DEFAULT_MAX_TOOL_STEPS,
  MAX_AUTO_RETRIES,
  OPTIONS_HASH,
  QUICK_FEEDBACK_MS,
} from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import {
  AI_STREAM_PORT_NAME,
  AI_STREAM_REQUEST_TYPE,
  CHAT_MODE,
} from "../../src/shared/types";
import type {
  AiStreamRequest,
  AiStreamResponse,
  AttachmentTab,
  Chat,
  ChatMessage,
  ChatMode,
  QuickAction,
  SendMessagesRequest,
  SelectedElement,
} from "../../src/shared/types";
import { useStoredState } from "../../src/ui/useStoredState";
import { requestGeneratedTitle, requestQuickAction } from "./ai-requests";
import { appendAssistantContent, appendAssistantPart } from "./chat-updates";
import { sortChatsNewestFirst } from "./format";
import {
  buildSidepanelContext,
  generateLocalTitle,
  interpolateQuickAction,
  toAttachmentTab,
} from "./sidepanel-context";
import {
  ADD_MENU_VIEW,
  COMPOSER_MENU,
  SidepanelView,
  type ComposerMenu,
} from "./sidepanel-view";
import { streamPartFromChunk } from "./stream-parts";
import { useActiveTabContext } from "./use-active-tab-context";

type ActiveStream = {
  chatId: string;
  assistantMessageId: string;
  retryCount: number;
  hasProgress: boolean;
};

export function SidepanelApp() {
  const [providers] = useStoredState(storage.provider);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [language] = useStoredState(storage.language);
  const [quickActions, setQuickActions] = useStoredState(storage.quickAction);
  const [chats, setChats] = useStoredState(storage.chats);
  const [activeChatId, setActiveChatId] = useState<string>();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(CHAT_MODE.agent);
  const [attachedTabs, setAttachedTabs] = useState<AttachmentTab[]>([]);
  const [availableTabs, setAvailableTabs] = useState<AttachmentTab[]>([]);
  const [selectedElement, setSelectedElement] =
    useState<SelectedElement | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [creatingQuickAction, setCreatingQuickAction] = useState(false);
  const [quickActionCreated, setQuickActionCreated] = useState(false);
  const [openMenu, setOpenMenu] = useState<ComposerMenu | null>(null);
  const [addMenuView, setAddMenuView] = useState<
    (typeof ADD_MENU_VIEW)[keyof typeof ADD_MENU_VIEW]
  >(ADD_MENU_VIEW.menu);
  const [showHistory, setShowHistory] = useState(false);
  const portRef = useRef<chrome.runtime.Port | undefined>(undefined);
  const sidepanelRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const chatsRef = useRef<Chat[]>([]);
  const initializedChatSelectionRef = useRef(false);
  const lastStreamActivityRef = useRef(Date.now());
  const activeStreamRef = useRef<ActiveStream | null>(null);

  const modelCount = useMemo(
    () =>
      Object.values(providers || {}).flatMap(
        (provider) => provider?.models || [],
      ).length,
    [providers],
  );
  const configuredModels = useMemo(
    () =>
      Object.values(providers || {}).flatMap(
        (provider) => provider?.models || [],
      ),
    [providers],
  );
  const currentChat = chats?.find((chat) => chat.id === activeChatId);
  const t = getMessages(language);
  const aiWorking = streaming || creatingQuickAction;

  useEffect(() => {
    if (aiWorking) setOpenMenu(null);
  }, [aiWorking]);

  useEffect(() => {
    chatsRef.current = chats || [];
  }, [chats]);

  useEffect(() => {
    document.documentElement.dataset.accent =
      preferences?.accentColor || "amber";
    document.documentElement.dataset.theme =
      preferences?.colorScheme || "system";
  }, [preferences?.accentColor, preferences?.colorScheme]);

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
  }, [activeChatId, chats]);

  useActiveTabContext({
    chats: chats || [],
    attachedTabs,
    selectedElement,
    setAttachedTabs,
    setSelectedElement,
  });

  useEffect(() => {
    if (preferences?.autoScroll === false) return;
    const messages = messagesRef.current;
    if (!messages) return;
    requestAnimationFrame(() => {
      messages.scrollTo({
        top: messages.scrollHeight,
        behavior: streaming ? "auto" : "smooth",
      });
    });
  }, [currentChat?.messages, preferences?.autoScroll, streaming]);

  useEffect(() => {
    if (!streaming || preferences?.autoRetry === false) return;
    const interval = window.setInterval(() => {
      const active = activeStreamRef.current;
      if (!active || active.retryCount >= MAX_AUTO_RETRIES) return;
      if (active.hasProgress) return;
      if (Date.now() - lastStreamActivityRef.current < AUTO_RETRY_IDLE_MS)
        return;
      retryStalledStream(active);
    }, AUTO_RETRY_POLL_MS);
    return () => window.clearInterval(interval);
  }, [preferences?.autoRetry, streaming]);

  function createChat() {
    const now = Date.now();
    const chat: Chat = {
      id: crypto.randomUUID(),
      title: t.words.newChat,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setChats((items) => [...items, chat]);
    setActiveChatId(chat.id);
  }

  function updateChat(chat: Chat) {
    setChats((items) =>
      items.map((candidate) => (candidate.id === chat.id ? chat : candidate)),
    );
  }

  function closeChat(chatId: string) {
    setChats((items) => {
      const next = items.filter((chat) => chat.id !== chatId);
      if (activeChatId === chatId)
        setActiveChatId(sortChatsNewestFirst(next)[0]?.id);
      return next;
    });
  }

  async function createQuickActionFromCurrentChat() {
    if (creatingQuickAction) return;
    if (!currentChat?.messages.length) {
      chrome.tabs.create({
        url: chrome.runtime.getURL(`/options.html${OPTIONS_HASH.quickActions}`),
      });
      return;
    }
    setCreatingQuickAction(true);
    setQuickActionCreated(false);
    requestQuickAction({
      modelId: preferences?.selectedModelId,
      messages: currentChat.messages,
      onSuccess: (quickAction) => {
        setQuickActions((items) => [...items, quickAction]);
        setCreatingQuickAction(false);
        setQuickActionCreated(true);
        window.setTimeout(
          () => setQuickActionCreated(false),
          QUICK_FEEDBACK_MS,
        );
      },
      onError: (error) => {
        if (error) console.warn("Failed to create quick action", error);
        setCreatingQuickAction(false);
      },
    });
  }

  async function send(content = input, quickAction?: QuickAction) {
    const text = interpolateQuickAction(content.trim());
    if (!text || streaming) return;
    const context = await buildContext();
    const chat = currentChat || createAndReturnChat();
    const sentTabs = attachedTabs;
    const sentElement = selectedElement;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: Date.now(),
      metadata: {
        ...(context ? { context } : {}),
        ...(sentTabs.length ? { attachedTabs: sentTabs } : {}),
        ...(sentElement ? { selectedElement: sentElement } : {}),
        ...(quickAction ? { quickAction } : {}),
      },
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      parts: [],
      createdAt: Date.now(),
    };
    const shouldGenerateTitle = chat.messages.length === 0;
    const nextChat = {
      ...chat,
      title: shouldGenerateTitle ? generateLocalTitle(text, t) : chat.title,
      messages: [...chat.messages, userMessage, assistantMessage],
      updatedAt: Date.now(),
    };
    updateChat(nextChat);
    if (shouldGenerateTitle) requestChatTitle(nextChat.id, text);
    setInput("");
    setAttachedTabs([]);
    setSelectedElement(null);
    setStreaming(true);

    const request: AiStreamRequest = {
      type: AI_STREAM_REQUEST_TYPE.sendMessages,
      chatId: nextChat.id,
      messageId: assistantMessage.id,
      messages: [...chat.messages, userMessage],
      body: {
        modelId: preferences?.selectedModelId,
        chatMode: mode,
        language,
        maxToolSteps: preferences?.maxToolSteps ?? DEFAULT_MAX_TOOL_STEPS,
        context: {
          tabs: sentTabs,
          selectedElement: sentElement,
          text: context,
        },
      },
    };
    activeStreamRef.current = {
      chatId: nextChat.id,
      assistantMessageId: assistantMessage.id,
      retryCount: 0,
      hasProgress: false,
    };
    lastStreamActivityRef.current = Date.now();
    startStream(request, assistantMessage.id);
  }

  function startStream(request: SendMessagesRequest, targetMessageId: string) {
    closeStreamPort(false);
    const port = chrome.runtime.connect({ name: AI_STREAM_PORT_NAME });
    portRef.current = port;
    port.onMessage.addListener((message: AiStreamResponse) => {
      lastStreamActivityRef.current = Date.now();
      if (message.type === "chunk") {
        if (activeStreamRef.current?.assistantMessageId === targetMessageId)
          activeStreamRef.current.hasProgress = true;
        appendStreamChunk(request.chatId, targetMessageId, message.chunk);
      }
      if (message.type === "error") {
        activeStreamRef.current = null;
        setStreaming(false);
        appendToAssistant(
          request.chatId,
          targetMessageId,
          `\n\n${message.error}`,
        );
      }
      if (message.type === "end") {
        activeStreamRef.current = null;
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

  function closeStreamPort(abort: boolean) {
    const port = portRef.current;
    portRef.current = undefined;
    if (!port) return;
    try {
      if (abort)
        port.postMessage({
          type: AI_STREAM_REQUEST_TYPE.abort,
        } satisfies AiStreamRequest);
    } catch {
      // Chrome throws if the service worker already disconnected the port.
    }
    try {
      port.disconnect();
    } catch {
      // Disconnect is best-effort for stale ports.
    }
  }

  function retryStalledStream(active: ActiveStream) {
    const chat = chatsRef.current.find(
      (candidate) => candidate.id === active.chatId,
    );
    const assistantIndex = chat?.messages.findIndex(
      (message) => message.id === active.assistantMessageId,
    );
    if (!chat || assistantIndex === undefined || assistantIndex < 0) return;

    active.retryCount += 1;
    lastStreamActivityRef.current = Date.now();
    const retryInstruction: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content:
        "<internal_instruction>The previous response stream stalled. Continue from the last completed step, start a new paragraph, do not repeat completed work, and respond in the same language as the user's latest non-internal message.</internal_instruction>",
      createdAt: Date.now(),
      metadata: { internalRetry: true },
    };

    if (chat.messages[assistantIndex]?.content.trim())
      appendToAssistant(active.chatId, active.assistantMessageId, "\n\n");

    startStream(
      {
        type: AI_STREAM_REQUEST_TYPE.sendMessages,
        chatId: active.chatId,
        messageId: crypto.randomUUID(),
        messages: [...chat.messages.slice(0, assistantIndex), retryInstruction],
        body: {
          modelId: preferences?.selectedModelId,
          chatMode: mode,
          language,
          maxToolSteps: preferences?.maxToolSteps ?? DEFAULT_MAX_TOOL_STEPS,
          context: {},
        },
      },
      active.assistantMessageId,
    );
  }

  function createAndReturnChat() {
    const now = Date.now();
    const chat: Chat = {
      id: crypto.randomUUID(),
      title: t.words.newChat,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setChats((items) => [...items, chat]);
    setActiveChatId(chat.id);
    return chat;
  }

  function appendToAssistant(
    chatId: string,
    messageId: string,
    content: string,
  ) {
    setChats((items) =>
      appendAssistantContent(items, chatId, messageId, content),
    );
  }

  function appendStreamChunk(
    chatId: string,
    messageId: string,
    chunk: unknown,
  ) {
    const { delta, part } = streamPartFromChunk(chunk);
    if (!delta && !part) return;
    setChats((items) =>
      appendAssistantPart({ chats: items, chatId, messageId, delta, part }),
    );
  }

  function stop() {
    activeStreamRef.current = null;
    closeStreamPort(true);
    setStreaming(false);
  }

  function requestChatTitle(chatId: string, message: string) {
    requestGeneratedTitle({
      modelId: preferences?.selectedModelId,
      message,
      onTitle: (title) =>
        setChats((items) =>
          items.map((chat) => (chat.id === chatId ? { ...chat, title } : chat)),
        ),
    });
  }

  async function attachActiveTab() {
    const tab = await getActiveTab();
    const attachment = tab ? toAttachmentTab(tab) : null;
    if (!attachment) return;
    setAttachedTabs((tabs) => [
      ...tabs.filter((item) => item.id !== attachment.id),
      attachment,
    ]);
  }

  async function showAllTabsPicker() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    setAvailableTabs(
      tabs
        .map((tab) => toAttachmentTab(tab))
        .filter((tab): tab is AttachmentTab => !!tab),
    );
    setAddMenuView(ADD_MENU_VIEW.tabs);
  }

  function toggleAttachedTab(tab: AttachmentTab) {
    setAttachedTabs((tabs) =>
      tabs.some((item) => item.id === tab.id)
        ? tabs.filter((item) => item.id !== tab.id)
        : [...tabs, tab],
    );
  }

  function removeAttachedTab(tabId: number) {
    setAttachedTabs((tabs) => tabs.filter((item) => item.id !== tabId));
  }

  async function selectElement() {
    const tab = await getActiveTab();
    if (tab?.id) await injectElementSelector(tab.id);
  }

  async function buildContext() {
    return buildSidepanelContext({ mode, attachedTabs, selectedElement });
  }

  return (
    <SidepanelView
      t={t}
      providersReady={!!providers}
      modelCount={modelCount}
      currentChat={currentChat}
      chats={chats || []}
      preferences={preferences}
      configuredModels={configuredModels}
      input={input}
      mode={mode}
      attachedTabs={attachedTabs}
      availableTabs={availableTabs}
      selectedElement={selectedElement}
      streaming={streaming}
      creatingQuickAction={creatingQuickAction}
      quickActionCreated={quickActionCreated}
      quickActions={quickActions || []}
      openMenu={openMenu}
      addMenuView={addMenuView}
      showHistory={showHistory}
      aiWorking={aiWorking}
      sidepanelRef={sidepanelRef}
      messagesRef={messagesRef}
      onSetInput={setInput}
      onSetMode={setMode}
      onSetOpenMenu={setOpenMenu}
      onSetAddMenuView={setAddMenuView}
      onSetShowHistory={setShowHistory}
      onSetSelectedElement={setSelectedElement}
      onSetChats={setChats}
      onSetPreferences={setPreferences}
      onCreateChat={createChat}
      onCloseChat={closeChat}
      onCreateQuickAction={createQuickActionFromCurrentChat}
      onSend={send}
      onStop={stop}
      onShowAllTabsPicker={showAllTabsPicker}
      onToggleAttachedTab={toggleAttachedTab}
      onAttachActiveTab={attachActiveTab}
      onRemoveAttachedTab={removeAttachedTab}
      onSelectElement={selectElement}
      onSelectChat={setActiveChatId}
    />
  );
}

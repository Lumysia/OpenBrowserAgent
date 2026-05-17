import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { marked } from "marked";
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  History,
  Layers,
  MessageCirclePlus,
  MousePointerClick,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Square,
  Trash2,
  Type,
  X,
} from "lucide-react";
import {
  extractTabText,
  getActiveTab,
  injectElementSelector,
} from "../../src/shared/browser";
import {
  AUTO_RETRY_IDLE_MS,
  COPY_FEEDBACK_MS,
  DEFAULT_MAX_TOOL_STEPS,
  LOCAL_CHAT_TITLE_MAX_LENGTH,
  MAX_AUTO_RETRIES,
  QUICK_FEEDBACK_MS,
  SELECTED_ELEMENT_HTML_MAX_CHARS,
  STREAM_RENDER_THROTTLE_MS,
  TAB_CONTENT_MAX_CHARS,
} from "../../src/shared/config";
import { getMessages, type Messages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import { providerLabels } from "../../src/shared/types";
import type {
  AiStreamRequest,
  AiStreamResponse,
  AttachmentTab,
  Chat,
  ChatMessage,
  ChatMode,
  ChatPart,
  ModelConfig,
  QuickAction,
  SelectedElement,
} from "../../src/shared/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import "../../src/ui/styles.css";

type ActiveStream = {
  chatId: string;
  assistantMessageId: string;
  retryCount: number;
  hasProgress: boolean;
};

function SidepanelApp() {
  const [providers] = useStoredState(storage.provider);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [language] = useStoredState(storage.language);
  const [quickActions, setQuickActions] = useStoredState(storage.quickAction);
  const [chats, setChats] = useStoredState(storage.chats);
  const [activeChatId, setActiveChatId] = useState<string>();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("Agent");
  const [attachedTabs, setAttachedTabs] = useState<AttachmentTab[]>([]);
  const [availableTabs, setAvailableTabs] = useState<AttachmentTab[]>([]);
  const [selectedElement, setSelectedElement] =
    useState<SelectedElement | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [creatingQuickAction, setCreatingQuickAction] = useState(false);
  const [quickActionCreated, setQuickActionCreated] = useState(false);
  const [openMenu, setOpenMenu] = useState<"add" | "model" | "mode" | null>(
    null,
  );
  const [addMenuView, setAddMenuView] = useState<"menu" | "tabs">("menu");
  const [showHistory, setShowHistory] = useState(false);
  const portRef = useRef<chrome.runtime.Port | undefined>(undefined);
  const autoAttachedRef = useRef(false);
  const sidepanelRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    const listener = (message: SelectedElement & { type?: string }) => {
      if (message.type === "getSelectedElement" || message.success)
        setSelectedElement(message);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    if (autoAttachedRef.current || selectedElement || attachedTabs.length)
      return;
    autoAttachedRef.current = true;
    autoAttachActiveTab();
  }, [attachedTabs.length, selectedElement]);

  useEffect(() => {
    const syncActiveTab = () => {
      void syncActiveTabContext();
    };
    chrome.tabs.onActivated.addListener(syncActiveTab);
    chrome.tabs.onUpdated.addListener(syncActiveTab);
    return () => {
      chrome.tabs.onActivated.removeListener(syncActiveTab);
      chrome.tabs.onUpdated.removeListener(syncActiveTab);
    };
  }, [attachedTabs.length, selectedElement]);

  async function syncActiveTabContext() {
    const tab = await getActiveTab();
    if (
      !tab?.id ||
      selectedElement ||
      attachedTabs.length >= 2 ||
      isTabAlreadySentAsSelected(tab.id)
    )
      return;
    setAttachedTabs([
      {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
      },
    ]);
  }

  function isTabAlreadySentAsSelected(tabId: number) {
    return (chats || []).some((chat) =>
      chat.messages.some((message) => {
        const selectedTabs = message.metadata?.attachedTabs;
        return (
          Array.isArray(selectedTabs) &&
          selectedTabs.some(
            (tab) =>
              typeof tab === "object" &&
              tab !== null &&
              (tab as AttachmentTab).id === tabId,
          )
        );
      }),
    );
  }

  useEffect(() => {
    if (!openMenu && !showHistory) return;
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          '[data-popover-root="true"], [data-radix-select-content], [role="listbox"]',
        )
      )
        return;
      setOpenMenu(null);
      setShowHistory(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenu(null);
      setShowHistory(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu, showHistory]);

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
    }, 1000);
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
        url: chrome.runtime.getURL("/options.html#/quick-actions"),
      });
      return;
    }
    setCreatingQuickAction(true);
    setQuickActionCreated(false);
    const port = chrome.runtime.connect({ name: "ai-stream" });
    const cleanup = () => {
      try {
        port.disconnect();
      } catch {
        // Best-effort cleanup for stale ports.
      }
    };
    port.onMessage.addListener((message: AiStreamResponse) => {
      if (message.type === "quickAction") {
        setQuickActions((items) => [...items, message.quickAction]);
        setCreatingQuickAction(false);
        setQuickActionCreated(true);
        window.setTimeout(
          () => setQuickActionCreated(false),
          QUICK_FEEDBACK_MS,
        );
        cleanup();
      }
      if (message.type === "error") {
        console.warn("Failed to create quick action", message.error);
        setCreatingQuickAction(false);
        cleanup();
      }
    });
    try {
      port.postMessage({
        type: "generateQuickAction",
        modelId: preferences?.selectedModelId,
        messages: currentChat.messages,
      } satisfies AiStreamRequest);
    } catch {
      setCreatingQuickAction(false);
      cleanup();
    }
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
    const nextChat = {
      ...chat,
      title: chat.messages.length === 0 ? generateLocalTitle(text) : chat.title,
      messages: [...chat.messages, userMessage, assistantMessage],
      updatedAt: Date.now(),
    };
    updateChat(nextChat);
    setInput("");
    setAttachedTabs([]);
    setSelectedElement(null);
    setStreaming(true);

    const request: AiStreamRequest = {
      type: "sendMessages",
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

  function startStream(
    request: Extract<AiStreamRequest, { type: "sendMessages" }>,
    targetMessageId: string,
  ) {
    closeStreamPort(false);
    const port = chrome.runtime.connect({ name: "ai-stream" });
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
      if (abort) port.postMessage({ type: "abort" } satisfies AiStreamRequest);
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
        type: "sendMessages",
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
      items.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === messageId
                  ? { ...message, content: message.content + content }
                  : message,
              ),
            }
          : chat,
      ),
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
      items.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === messageId
                  ? {
                      ...message,
                      content: delta
                        ? message.content + delta
                        : message.content,
                      parts: part
                        ? applyPart(message.parts, part)
                        : message.parts,
                    }
                  : message,
              ),
              updatedAt: Date.now(),
            }
          : chat,
      ),
    );
  }

  function stop() {
    activeStreamRef.current = null;
    closeStreamPort(true);
    setStreaming(false);
  }

  function interpolateQuickAction(value: string) {
    const date = new Date().toISOString().slice(0, 10);
    return value.replaceAll("{{ date }}", date);
  }

  function generateLocalTitle(value: string) {
    const title = value.replace(/\s+/g, " ").trim();
    return title.length > LOCAL_CHAT_TITLE_MAX_LENGTH
      ? `${title.slice(0, LOCAL_CHAT_TITLE_MAX_LENGTH)}...`
      : title || t.words.newChat;
  }

  async function attachActiveTab() {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    setAttachedTabs((tabs) => [
      ...tabs.filter((item) => item.id !== tab.id),
      {
        id: tab.id!,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
      },
    ]);
  }

  async function openAddContextMenu() {
    setAddMenuView("menu");
    setOpenMenu(openMenu === "add" ? null : "add");
  }

  async function showAllTabsPicker() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    setAvailableTabs(
      tabs
        .filter((tab) => tab.id)
        .map((tab) => ({
          id: tab.id!,
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl,
        })),
    );
    setAddMenuView("tabs");
  }

  function toggleAttachedTab(tab: AttachmentTab) {
    setAttachedTabs((tabs) =>
      tabs.some((item) => item.id === tab.id)
        ? tabs.filter((item) => item.id !== tab.id)
        : [...tabs, tab],
    );
  }

  async function autoAttachActiveTab() {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    setAttachedTabs([
      {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
      },
    ]);
  }

  function removeAttachedTab(tabId: number) {
    setAttachedTabs((tabs) => tabs.filter((item) => item.id !== tabId));
  }

  async function selectElement() {
    const tab = await getActiveTab();
    if (tab?.id) await injectElementSelector(tab.id);
  }

  async function buildContext() {
    const parts: string[] = [];
    if (selectedElement) {
      parts.push(
        [
          "<selected_element>",
          selectedElement.aiId
            ? `<ai_id>${selectedElement.aiId}</ai_id>`
            : undefined,
          `<tab_id>${attachedTabs[0]?.id || ""}</tab_id>`,
          selectedElement.tagName
            ? `<tag_name>${escapeXml(selectedElement.tagName)}</tag_name>`
            : undefined,
          selectedElement.innerText
            ? `<inner_text>${escapeXml(selectedElement.innerText)}</inner_text>`
            : undefined,
          `<value>${escapeXml(selectedElement.value || "")}</value>`,
          selectedElement.outerHTML
            ? `<outer_html>${escapeXml(selectedElement.outerHTML.slice(0, SELECTED_ELEMENT_HTML_MAX_CHARS))}</outer_html>`
            : undefined,
          "</selected_element>",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
    if (attachedTabs.length) {
      const tabBlocks = [];
      for (const tab of attachedTabs) {
        try {
          const text = mode === "Ask" ? await extractTabText(tab.id) : "";
          tabBlocks.push(
            [
              "<tab>",
              `<tab_id>${tab.id}</tab_id>`,
              "</tab>",
              `<title>${escapeXml(tab.title || "")}</title>`,
              `<url>${escapeXml(tab.url || "")}</url>`,
              `<content>${escapeXml(text ? text.slice(0, TAB_CONTENT_MAX_CHARS) : "")}</content>`,
            ].join("\n"),
          );
        } catch {
          tabBlocks.push(
            [
              "<tab>",
              `<tab_id>${tab.id}</tab_id>`,
              "</tab>",
              `<title>${escapeXml(tab.title || "")}</title>`,
              `<url>${escapeXml(tab.url || "")}</url>`,
              "<content></content>",
            ].join("\n"),
          );
        }
      }
      parts.push(`<selected_tabs>\n${tabBlocks.join("\n")}\n</selected_tabs>`);
    } else {
      const tab = await getActiveTab();
      if (tab?.id)
        parts.push(
          `<current_tab>\n<id>${tab.id}</id>\n<title>${escapeXml(tab.title || "")}</title>\n<url>${escapeXml(tab.url || "")}</url>\n</current_tab>`,
        );
    }
    return parts.join("\n\n");
  }

  if (providers && modelCount === 0) {
    return (
      <div className="sidepanel">
        <div className="empty">
          <Card className="stack" style={{ maxWidth: 320 }}>
            <CardHeader>
              <Bot size={34} />
              <CardTitle>{t.sidepanel.connectProviderTitle}</CardTitle>
              <CardDescription>
                {t.sidepanel.connectProviderDescription}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => chrome.runtime.openOptionsPage()}>
                {t.sidepanel.addProvider}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="sidepanel" ref={sidepanelRef}>
      <header className="sidepanel-header">
        <div className="sidepanel-topbar">
          <Button
            className="tooltip tooltip-left-edge"
            data-tooltip={t.sidepanel.clearAllChats}
            variant="ghost"
            size="icon"
            onClick={() => setChats([])}
          >
            <Trash2 size={18} />
          </Button>
          <div />
          <div className="topbar-actions">
            <Button
              className="tooltip"
              data-tooltip={t.words.newChat}
              variant="ghost"
              size="icon"
              onClick={createChat}
            >
              <MessageCirclePlus size={18} />
            </Button>
            <Button
              data-popover-root="true"
              className="tooltip"
              data-tooltip={t.sidepanel.chatHistory}
              variant="ghost"
              size="icon"
              onClick={() => setShowHistory((value) => !value)}
            >
              <History size={18} />
            </Button>
            <Button
              className="tooltip tooltip-right-edge"
              data-tooltip={t.common.settings}
              variant="ghost"
              size="icon"
              onClick={() => chrome.runtime.openOptionsPage()}
            >
              <Settings size={18} />
            </Button>
          </div>
          {showHistory && (
            <HistoryPanel
              t={t}
              chats={chats || []}
              activeChatId={currentChat?.id}
              onSelect={(chatId) => {
                setActiveChatId(chatId);
                setShowHistory(false);
              }}
              onClose={closeChat}
            />
          )}
        </div>
      </header>
      <main className="messages" ref={messagesRef}>
        {!currentChat?.messages.length && (
          <div className="empty">
            <div>
              <h2>{t.sidepanel.whatDoYouWant}</h2>
              <p className="muted">{t.sidepanel.emptyDescription}</p>
            </div>
          </div>
        )}
        {currentChat?.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </main>
      <footer className="composer">
        <div className="quick-action-create-row">
          <Button
            className="quick-action-create"
            variant="secondary"
            size="sm"
            disabled={creatingQuickAction}
            onClick={createQuickActionFromCurrentChat}
          >
            <Plus size={16} />{" "}
            {creatingQuickAction
              ? t.sidepanel.generatingQuickAction
              : quickActionCreated
                ? t.sidepanel.quickActionCreated
                : t.sidepanel.createQuickAction}
          </Button>
        </div>
        {openMenu === "add" && addMenuView === "tabs" && (
          <AddContextMenu
            t={t}
            view={addMenuView}
            tabs={availableTabs}
            quickActions={quickActions || []}
            selectedTabIds={attachedTabs.map((tab) => tab.id)}
            onShowTabs={showAllTabsPicker}
            onQuickAction={(action) => {
              send(action.instruction, action);
              setOpenMenu(null);
            }}
            onToggleTab={toggleAttachedTab}
            onAttachTab={async () => {
              await attachActiveTab();
              setOpenMenu(null);
            }}
            onSelectElement={async () => {
              await selectElement();
              setOpenMenu(null);
            }}
          />
        )}
        <div className="context-strip">
          <div className="context-chip-row">
            {attachedTabs.map((tab) => (
              <AttachedTabCard
                key={tab.id}
                t={t}
                tab={tab}
                onRemove={() => removeAttachedTab(tab.id)}
              />
            ))}
          </div>
          {selectedElement && (
            <div className="context-card">
              <MousePointerClick size={18} />
              <span>
                <strong>
                  {selectedElement.tagName || t.sidepanel.elementSelected}
                </strong>
                <small>{t.sidepanel.willBeSentAsPageContext}</small>
              </span>
              <button
                className="context-close"
                title={t.sidepanel.selectElement}
                onClick={() => setSelectedElement(null)}
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="composer-box">
          {aiWorking && (
            <div className="ai-working-overlay" aria-live="polite">
              <span className="ai-working-orb" />
              <span>
                <strong>
                  {creatingQuickAction
                    ? t.sidepanel.generatingQuickAction
                    : t.sidepanel.aiWorking}
                </strong>
                <small>{t.sidepanel.aiWorkingDescription}</small>
              </span>
              <span className="ai-working-bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
          <Textarea
            value={input}
            placeholder={t.sidepanel.whatDoYouWant}
            disabled={aiWorking}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.metaKey &&
                !event.ctrlKey
              ) {
                event.preventDefault();
                send();
              }
            }}
          />
          <div className="composer-controls">
            <div className="composer-left">
              <Button
                data-popover-root="true"
                className="composer-icon-button"
                variant="outline"
                size="icon"
                disabled={aiWorking}
                onClick={openAddContextMenu}
              >
                <Plus size={20} />
              </Button>
              {openMenu === "add" && addMenuView === "menu" && (
                <AddContextMenu
                  t={t}
                  view={addMenuView}
                  tabs={availableTabs}
                  quickActions={quickActions || []}
                  selectedTabIds={attachedTabs.map((tab) => tab.id)}
                  onShowTabs={showAllTabsPicker}
                  onQuickAction={(action) => {
                    send(action.instruction, action);
                    setOpenMenu(null);
                  }}
                  onToggleTab={toggleAttachedTab}
                  onAttachTab={async () => {
                    await attachActiveTab();
                    setOpenMenu(null);
                  }}
                  onSelectElement={async () => {
                    await selectElement();
                    setOpenMenu(null);
                  }}
                />
              )}
            </div>
            <div className="composer-selectors">
              <div className="selector-anchor model-anchor">
                <button
                  data-popover-root="true"
                  className="composer-trigger"
                  disabled={aiWorking}
                  onClick={() =>
                    setOpenMenu(openMenu === "model" ? null : "model")
                  }
                >
                  {selectedModelLabel(
                    preferences?.selectedModelId,
                    configuredModels,
                    t,
                  )}{" "}
                  <ChevronDown size={15} />
                </button>
                {openMenu === "model" && (
                  <ModelMenu
                    t={t}
                    models={configuredModels}
                    selectedModelId={preferences?.selectedModelId}
                    onSelect={(modelId) => {
                      if (preferences)
                        setPreferences({
                          ...preferences,
                          selectedModelId: modelId,
                        });
                      setOpenMenu(null);
                    }}
                  />
                )}
              </div>
              <div className="selector-anchor mode-anchor">
                <button
                  data-popover-root="true"
                  className="composer-trigger"
                  disabled={aiWorking}
                  onClick={() =>
                    setOpenMenu(openMenu === "mode" ? null : "mode")
                  }
                >
                  {mode === "Agent" ? t.words.agent : t.words.ask}{" "}
                  <ChevronDown size={15} />
                </button>
                {openMenu === "mode" && (
                  <ModeMenu
                    t={t}
                    mode={mode}
                    onSelect={(nextMode) => {
                      setMode(nextMode);
                      setOpenMenu(null);
                    }}
                  />
                )}
              </div>
            </div>
            {streaming ? (
              <Button
                className="send-button tooltip"
                data-tooltip={t.sidepanel.stop}
                onClick={stop}
              >
                <Square size={18} />
              </Button>
            ) : (
              <Button
                className="send-button tooltip"
                data-tooltip={t.sidepanel.send}
                disabled={creatingQuickAction}
                onClick={() => send()}
              >
                <Send size={20} />
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function HistoryPanel({
  t,
  chats,
  activeChatId,
  onSelect,
  onClose,
}: {
  t: Messages;
  chats: Chat[];
  activeChatId?: string;
  onSelect: (chatId: string) => void;
  onClose: (chatId: string) => void;
}) {
  const sortedChats = sortChatsNewestFirst(chats);
  return (
    <div className="history-panel" data-popover-root="true">
      <div className="history-panel-header">{t.sidepanel.chatHistory}</div>
      {!chats.length && (
        <div className="history-empty">{t.sidepanel.noChatsYet}</div>
      )}
      {sortedChats.map((chat) => (
        <div
          className={`history-item ${chat.id === activeChatId ? "active" : ""}`}
          key={chat.id}
        >
          <button onClick={() => onSelect(chat.id)}>
            <strong>{chat.title || t.words.newChat}</strong>
            <small>
              {formatMessageCount(t, chat.messages.length)} ·{" "}
              {formatRelativeTime(t, chat.updatedAt)}
            </small>
          </button>
          <button
            className="history-close"
            title={t.sidepanel.closeChat}
            onClick={() => onClose(chat.id)}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

function sortChatsNewestFirst(chats: Chat[]) {
  return [...chats].sort(
    (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt),
  );
}

function formatMessageCount(t: Messages, count: number) {
  return formatToolMessage(t.sidepanel.messageCount, { count });
}

function formatRelativeTime(t: Messages, value: number) {
  const diff = Date.now() - value;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60)
    return formatToolMessage(t.sidepanel.relativeMinutesAgo, {
      count: minutes,
    });
  const hours = Math.round(minutes / 60);
  if (hours < 24)
    return formatToolMessage(t.sidepanel.relativeHoursAgo, { count: hours });
  return formatToolMessage(t.sidepanel.relativeDaysAgo, {
    count: Math.round(hours / 24),
  });
}

function AddContextMenu({
  t,
  view,
  tabs,
  quickActions,
  selectedTabIds,
  onShowTabs,
  onQuickAction,
  onToggleTab,
  onAttachTab,
  onSelectElement,
}: {
  t: Messages;
  view: "menu" | "tabs";
  tabs: AttachmentTab[];
  quickActions: QuickAction[];
  selectedTabIds: number[];
  onShowTabs: () => void;
  onQuickAction: (action: QuickAction) => void;
  onToggleTab: (tab: AttachmentTab) => void;
  onAttachTab: () => void;
  onSelectElement: () => void;
}) {
  if (view === "menu") {
    return (
      <div
        className="composer-menu add-context-menu add-context-menu-compact"
        data-popover-root="true"
      >
        <button className="composer-menu-item" onClick={onShowTabs}>
          <Layers size={17} />
          <span>
            <strong>{t.sidepanel.addNewTab}</strong>
          </span>
        </button>
        {!!quickActions.length && (
          <>
            <div className="composer-menu-section-title">
              {t.options.quickActions}
            </div>
            {quickActions.map((action) => (
              <button
                key={action.id}
                className="composer-menu-item"
                onClick={() => onQuickAction(action)}
              >
                <FileText size={17} />
                <span>
                  <strong>{action.title || t.options.untitledAction}</strong>
                </span>
              </button>
            ))}
          </>
        )}
        <button className="composer-menu-item" onClick={onSelectElement}>
          <MousePointerClick size={17} />
          <span>
            <strong>{t.sidepanel.selectElement}</strong>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="composer-menu add-context-menu add-tabs-panel"
      data-popover-root="true"
    >
      <div className="tab-picker-title">
        <Layers size={17} /> {t.sidepanel.allOpenTabs} ({tabs.length})
      </div>
      <div className="tab-picker-list">
        <button
          className={`tab-picker-item ${selectedTabIds.length === tabs.length ? "active" : ""}`}
          onClick={() =>
            tabs.forEach((tab) => {
              if (
                selectedTabIds.length === tabs.length ||
                !selectedTabIds.includes(tab.id)
              )
                onToggleTab(tab);
            })
          }
        >
          <Layers size={20} />
          <span>
            {t.sidepanel.allOpenTabs} ({tabs.length})
          </span>
        </button>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-picker-item ${selectedTabIds.includes(tab.id) ? "active" : ""}`}
            onClick={() => onToggleTab(tab)}
          >
            {tab.favIconUrl ? (
              <img src={tab.favIconUrl} alt="" />
            ) : (
              <ExternalLink size={20} />
            )}
            <span>{tab.title || tab.url || `Tab ${tab.id}`}</span>
          </button>
        ))}
      </div>
      <div className="tab-picker-actions">
        <button className="composer-menu-item" onClick={onAttachTab}>
          <Plus size={17} />
          <span>
            <strong>{t.sidepanel.addCurrentTab}</strong>
          </span>
        </button>
        <button className="composer-menu-item" onClick={onSelectElement}>
          <MousePointerClick size={17} />
          <span>
            <strong>{t.sidepanel.selectElement}</strong>
          </span>
        </button>
      </div>
    </div>
  );
}

function AttachedTabCard({
  t,
  tab,
  onRemove,
}: {
  t: Messages;
  tab: AttachmentTab;
  onRemove: () => void;
}) {
  return (
    <div className="context-card">
      {tab.favIconUrl ? (
        <img src={tab.favIconUrl} alt="" />
      ) : (
        <ExternalLink size={18} />
      )}
      <span>
        <strong>{tab.title || t.sidepanel.currentPage}</strong>
        <small>
          {tab.url || `Tab ${tab.id}`} · {t.sidepanel.willBeSentToAi}
        </small>
      </span>
      <button className="context-close" title="Remove tab" onClick={onRemove}>
        <X size={14} />
      </button>
    </div>
  );
}

function ModelMenu({
  t,
  models,
  selectedModelId,
  onSelect,
}: {
  t: Messages;
  models: ModelConfig[];
  selectedModelId?: string;
  onSelect: (modelId: string) => void;
}) {
  return (
    <div className="composer-menu model-menu" data-popover-root="true">
      {!models.length && (
        <div className="composer-menu-empty">
          {t.sidepanel.noModelsConfigured}
        </div>
      )}
      {models.map((model) => (
        <button
          className="model-menu-item"
          key={model.id}
          onClick={() => onSelect(model.id)}
        >
          <span className="model-provider-mark">
            {providerInitial(model.id)}
          </span>
          <span>
            <small>{providerName(model.id)}</small>
            <strong>{model.name}</strong>
          </span>
          {selectedModelId === model.id && (
            <Check className="menu-check" size={18} />
          )}
        </button>
      ))}
    </div>
  );
}

function ModeMenu({
  t,
  mode,
  onSelect,
}: {
  t: Messages;
  mode: ChatMode;
  onSelect: (mode: ChatMode) => void;
}) {
  const modes: Array<{ id: ChatMode; title: string; description: string }> = [
    {
      id: "Agent",
      title: t.words.agent,
      description: t.sidepanel.agentDescription,
    },
    { id: "Ask", title: t.words.ask, description: t.sidepanel.askDescription },
  ];
  return (
    <div className="composer-menu mode-menu" data-popover-root="true">
      {modes.map((item) => (
        <button
          className={`mode-menu-item ${mode === item.id ? "active" : ""}`}
          key={item.id}
          onClick={() => onSelect(item.id)}
        >
          <span>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </span>
          {mode === item.id && <Check className="menu-check" size={18} />}
        </button>
      ))}
    </div>
  );
}

function selectedModelLabel(
  modelId: string | undefined,
  models: ModelConfig[],
  t: Messages,
) {
  const model = models.find((candidate) => candidate.id === modelId);
  return model?.name || t.sidepanel.selectModel;
}

function providerName(modelId: string) {
  const provider = modelId.split(":")[0] as keyof typeof providerLabels;
  return providerLabels[provider] || provider;
}

function providerInitial(modelId: string) {
  return providerName(modelId).slice(0, 1).toUpperCase();
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [language] = useStoredState(storage.language);
  const t = getMessages(language);
  const quickAction = message.metadata?.quickAction as QuickAction | undefined;
  const sentTabs = Array.isArray(message.metadata?.attachedTabs)
    ? (message.metadata.attachedTabs as AttachmentTab[])
    : [];
  const sentElement = message.metadata?.selectedElement as
    | SelectedElement
    | undefined;
  const hasParts = !!message.parts?.length;
  return (
    <div className={`message ${message.role === "user" ? "user" : ""}`}>
      {quickAction && <div className="message-label">{quickAction.title}</div>}
      {message.role === "user" ? (
        <div className="user-bubble">{message.content}</div>
      ) : hasParts ? (
        message.parts?.map((part) => (
          <AssistantPart key={part.id} t={t} part={part} />
        ))
      ) : !message.content ? (
        <span className="typing-dots" aria-label="Thinking">
          <span />
          <span />
          <span />
        </span>
      ) : (
        <AssistantText text={message.content} />
      )}
      {message.role === "user" && !!sentTabs.length && (
        <div className="sent-context-row">
          <SentTabsChip tabs={sentTabs} />
        </div>
      )}
      {message.role === "user" && sentElement && (
        <div className="sent-context-row">
          <div className="sent-tab-chip">
            <MousePointerClick size={22} />
            <span>
              <strong>
                {sentElement.tagName || t.sidepanel.elementSelected}
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function AssistantPart({ t, part }: { t: Messages; part: ChatPart }) {
  if (part.type.startsWith("tool-")) return <ToolPart t={t} part={part} />;
  if (part.type === "text" && part.text?.trim())
    return <AssistantText text={part.text} />;
  return null;
}

function AssistantText({ text }: { text: string }) {
  const [language] = useStoredState(storage.language);
  const [copied, setCopied] = useState(false);
  const t = getMessages(language);
  const displayText = useThrottledText(text, STREAM_RENDER_THROTTLE_MS);
  const html = marked.parse(displayText);
  const streaming = displayText.length < text.length;

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  function copyText() {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch(() => undefined);
  }

  return (
    <div className={`assistant-text${streaming ? " streaming" : ""}`}>
      <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
      <button
        className={`copy-message tooltip${copied ? " copied" : ""}`}
        data-tooltip={copied ? t.common.copied : t.common.copy}
        onClick={copyText}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

function useThrottledText(value: string, delayMs: number) {
  const [displayValue, setDisplayValue] = useState(value);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    const waitMs = Math.max(0, delayMs - (now - lastUpdateRef.current));
    const timeout = window.setTimeout(() => {
      lastUpdateRef.current = Date.now();
      setDisplayValue(value);
    }, waitMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return displayValue;
}

function SentTabsChip({ tabs }: { tabs: AttachmentTab[] }) {
  const visibleTabs = tabs.slice(0, 2);
  const title = tabs
    .slice(0, 2)
    .map((tab) => tab.title || "Current page")
    .join(", ");
  const urls = tabs
    .slice(0, 2)
    .map((tab) => tab.url?.replace(/^https?:\/\//, "").replace(/^www\./, ""))
    .filter(Boolean)
    .join(", ");
  const extraCount = tabs.length - visibleTabs.length;
  return (
    <div className="sent-tabs-chip">
      <div className="sent-tabs-icons">
        {visibleTabs.map((tab) =>
          tab.favIconUrl ? (
            <img key={tab.id} src={tab.favIconUrl} alt="" />
          ) : (
            <ExternalLink key={tab.id} size={24} />
          ),
        )}
      </div>
      <span>
        <strong>
          {title}
          {extraCount > 0 ? <em>+ {extraCount}</em> : null}
        </strong>
        <small>{urls}</small>
      </span>
    </div>
  );
}

function applyPart(parts: ChatPart[] = [], part: ChatPart) {
  const index = parts.findIndex((candidate) => candidate.id === part.id);
  if (index === -1) return [...parts, part];
  return parts.map((candidate, candidateIndex) => {
    if (candidateIndex !== index) return candidate;
    if (candidate.type === "text" && part.type === "text" && part.append)
      return {
        ...candidate,
        text: `${candidate.text || ""}${part.text || ""}`,
      };
    return { ...candidate, ...part };
  });
}

function streamPartFromChunk(chunk: unknown): {
  delta?: string;
  part?: ChatPart;
} {
  if (!chunk || typeof chunk !== "object") return {};
  const maybe = chunk as {
    type?: string;
    id?: string;
    delta?: string;
    toolCallId?: string;
    toolName?: string;
    state?:
      | "input-streaming"
      | "input-available"
      | "output-available"
      | "output-error";
    input?: unknown;
    output?: unknown;
    error?: string;
  };
  if (maybe.type === "text-start" || maybe.type === "text-note-start")
    return {
      part: { id: maybe.id || crypto.randomUUID(), type: "text", text: "" },
    };
  if (maybe.type === "text-end" || maybe.type === "text-note-end") return {};
  if (maybe.type === "text-delta" || maybe.type === "text-note-delta")
    return {
      delta: maybe.type === "text-delta" ? maybe.delta || "" : undefined,
      part: {
        id: maybe.id || crypto.randomUUID(),
        type: "text",
        text: maybe.delta || "",
        append: true,
      },
    };
  if (maybe.type?.startsWith("tool-")) {
    const toolName = maybe.toolName || maybe.type.replace(/^tool-/, "");
    return {
      part: {
        id: maybe.toolCallId || maybe.id || crypto.randomUUID(),
        type: `tool-${toolName}`,
        toolName,
        state: maybe.state || "input-available",
        input: maybe.input,
        output: maybe.output,
        error: maybe.error,
      },
    };
  }
  return {};
}

function ToolPart({ t, part }: { t: Messages; part: ChatPart }) {
  if (!part.type.startsWith("tool-")) return null;
  const name = part.toolName || part.type.replace(/^tool-/, "");
  const { title, description, references } = toolDisplay(name, part, t);
  const loading =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  return (
    <div
      className={`tool-card ${loading ? "loading" : ""} ${isError ? "error" : ""}`}
    >
      <div className="tool-title">
        <span className="tool-icon">{toolIcon(name)}</span>
        <strong>
          {loading ? <span className="shiny-text">{title}</span> : title}
        </strong>
      </div>
      <div className="tool-detail">
        {description && <div className="tool-description">{description}</div>}
        {!!references.length && (
          <div className="tool-references">
            {references.map((reference) => (
              <button
                key={reference.title}
                onClick={
                  reference.url
                    ? () => chrome.tabs.create({ url: reference.url })
                    : undefined
                }
              >
                {reference.icon}
                <span>{reference.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function toolDisplay(name: string, part: ChatPart, t: Messages) {
  const input = (part.input || {}) as Record<string, unknown>;
  const outputValue = part.output;
  const output = (outputValue || {}) as Record<string, unknown>;
  const state = part.state;
  const toolText = t.sidepanel.tool[name as keyof typeof t.sidepanel.tool];
  const toolFound = (toolText as { found?: string } | undefined)?.found;
  const title = (() => {
    const base =
      state === "output-available" ? toolText?.done : toolText?.running;
    if (
      name === "groupTabs" &&
      state === "output-available" &&
      typeof input.title === "string"
    )
      return `${base || toolLabel(name, t)}: ${input.title}`;
    return base || toolLabel(name, t);
  })();
  const description = (() => {
    if (typeof output.error === "string") return output.error;
    if (typeof input.reason === "string") return input.reason;
    if (
      name === "findAccessableElementsFromTab" &&
      Array.isArray(output.elements)
    )
      return formatToolMessage(toolFound, { count: output.elements.length });
    if (name === "getAllTabs" && Array.isArray(outputValue))
      return formatToolMessage(toolFound, { count: outputValue.length });
    if (name === "inputTextByAiID" && typeof input.text === "string")
      return input.text;
    if (typeof output.filename === "string") return output.filename;
    if (part.state === "output-error") return t.sidepanel.error;
    return "";
  })();
  const references = toolReferences(name, output, input);
  return { title, description, references };
}

function formatToolMessage(
  template: string | undefined,
  values: Record<string, string | number>,
) {
  if (!template) return "";
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function toolReferences(
  name: string,
  output: Record<string, unknown>,
  input: Record<string, unknown>,
) {
  const references: Array<{
    title: string;
    url?: string;
    icon: React.ReactNode;
  }> = [];
  if (
    name === "openNewTabWithURL" &&
    output.tab &&
    typeof output.tab === "object"
  ) {
    const tab = output.tab as { title?: string; url?: string };
    if (tab.title)
      references.push({
        title: tab.title,
        url: tab.url,
        icon: <ExternalLink size={14} />,
      });
    return references;
  }
  if (name === "getTabContent" && Array.isArray(output.contents)) {
    return output.contents
      .map((item) => item as { title?: string; url?: string })
      .filter((item) => item.title)
      .map((item) => ({
        title: item.title || "",
        url: item.url,
        icon: <ExternalLink size={14} />,
      }));
  }
  if (name === "openSearchTab" && typeof input.query === "string")
    references.push({ title: input.query, icon: <Search size={14} /> });
  return references;
}

function toolIcon(name: string) {
  if (name.includes("input")) return <Type size={19} strokeWidth={2.1} />;
  if (name.includes("click"))
    return <MousePointerClick size={19} strokeWidth={2.1} />;
  if (name.includes("find")) return <Search size={19} strokeWidth={2.1} />;
  if (name.includes("download"))
    return <Download size={19} strokeWidth={2.1} />;
  if (name.includes("Content")) return <FileText size={19} strokeWidth={2.1} />;
  if (name.includes("group")) return <Layers size={19} strokeWidth={2.1} />;
  if (name.includes("Tab")) return <ExternalLink size={19} strokeWidth={2.1} />;
  return <Square size={15} strokeWidth={2.1} />;
}

function toolLabel(name: string, t: Messages) {
  const toolText = t.sidepanel.tool[name as keyof typeof t.sidepanel.tool];
  return toolText?.done || toolText?.running || name;
}

createRoot(document.getElementById("root")!).render(<SidepanelApp />);

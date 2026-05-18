import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUTO_RETRY_IDLE_MS,
  AUTO_RETRY_POLL_MS,
  DEFAULT_MAX_TOOL_STEPS,
  MAX_AUTO_RETRIES,
} from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { isSkillEnabled } from "../../src/shared/skills";
import { storage } from "../../src/shared/storage";
import {
  AI_STREAM_PORT_NAME,
  AI_STREAM_REQUEST_TYPE,
  CHAT_MODE,
  type AiStreamRequest,
  type AiStreamResponse,
  type Chat,
  type ChatMode,
  type SendMessagesRequest,
  type Skill,
  type UploadedAttachment,
} from "../../src/shared/types";
import { useBuiltinSkills } from "../../src/ui/useBuiltinSkills";
import { useStoredState } from "../../src/ui/useStoredState";
import { requestGeneratedTitle } from "./ai-requests";
import { appendAssistantContent, appendAssistantPart } from "./chat-updates";
import { pruneSentAttachmentPreviews } from "./edit-message";
import { sortChatsNewestFirst } from "./format";
import { assistantModelLabel } from "./model-label";
import { retryStalledStream } from "./retry-stalled-stream";
import {
  buildSidepanelContext,
  interpolateSkillVariables,
} from "./sidepanel-context";
import { createSendMessagePlan } from "./send-message-plan";
import { interpolateSkillPackage } from "./skill-context";
import {
  ADD_MENU_VIEW,
  COMPOSER_MENU,
  type AddMenuView,
  type ActiveStream,
  type ComposerMenu,
} from "./sidepanel-menu-state";
import { SidepanelView } from "./sidepanel-view";
import { streamPartFromChunk } from "./stream-parts";
import { closeStreamPort } from "./stream-port";
import { useComposerContext } from "./use-composer-context";
import { useElementSelector } from "./use-element-selector";
import { useMessageEdit } from "./use-message-edit";
import { createSkillFromChat } from "./use-skill-creator";
import { useUploadedAttachments } from "./use-uploaded-attachments";

export function SidepanelApp() {
  const [providers] = useStoredState(storage.provider);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [language] = useStoredState(storage.language);
  const [skills, setSkills] = useStoredState(storage.skills);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [chats, setChats] = useStoredState(storage.chats);
  const [activeChatId, setActiveChatId] = useState<string>();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(CHAT_MODE.agent);
  const [streaming, setStreaming] = useState(false);
  const [creatingSkill, setCreatingSkill] = useState(false);
  const [skillCreated, setSkillCreated] = useState(false);
  const [openMenu, setOpenMenu] = useState<ComposerMenu | null>(null);
  const [addMenuView, setAddMenuView] = useState<AddMenuView>("menu");
  const [showHistory, setShowHistory] = useState(false);
  const [sentAttachmentPreviews, setSentAttachmentPreviews] = useState<
    Record<string, UploadedAttachment[]>
  >({});
  const portRef = useRef<chrome.runtime.Port | undefined>(undefined);
  const sidepanelRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const chatsRef = useRef<Chat[]>([]);
  const initializedChatSelectionRef = useRef(false);
  const lastStreamActivityRef = useRef(Date.now());
  const activeStreamRef = useRef<ActiveStream | null>(null);

  const configuredModels = useMemo(
    () =>
      Object.values(providers || {}).flatMap(
        (provider) => provider?.models || [],
      ),
    [providers],
  );
  const modelCount = configuredModels.length;
  const currentChat = chats?.find((chat) => chat.id === activeChatId);
  const t = getMessages(language);
  const aiWorking = streaming || creatingSkill;
  const { selectElement } = useElementSelector();
  const {
    uploadedAttachments,
    pendingAttachments,
    attachmentNotice,
    attachFiles,
    removeUploadedAttachment,
    replaceUploadedAttachment,
    stageUploadedAttachments,
    clearPendingAttachments,
    clearUploadedAttachments,
  } = useUploadedAttachments(t);
  const {
    attachedTabs,
    availableTabs,
    selectedElement,
    setAttachedTabs,
    setSelectedElement,
    attachActiveTab,
    showAllTabsPicker,
    toggleAttachedTab,
    removeAttachedTab,
  } = useComposerContext(chats || []);
  const { editingMessage, setEditingMessage, editMessage, cancelEditMessage } =
    useMessageEdit({
      currentChat,
      streaming,
      input,
      pendingAttachments,
      attachedTabs,
      selectedElement,
      setInput,
      setAttachedTabs,
      setSelectedElement,
      stageUploadedAttachments,
    });

  useEffect(() => void (aiWorking && setOpenMenu(null)), [aiWorking]);

  useBuiltinSkills(skills, setSkills);
  useEffect(() => {
    chatsRef.current = chats || [];
  }, [chats]);

  useEffect(() => {
    document.documentElement.dataset.accent =
      preferences?.accentColor || "pink";
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
    clearUploadedAttachments();
    setEditingMessage(null);
    setSentAttachmentPreviews({});
  }, [activeChatId]);

  useEffect(() => {
    if (preferences?.autoScroll === false) return;
    const messages = messagesRef.current;
    if (!messages) return;
    requestAnimationFrame(() => {
      messages.scrollTo({
        top: messages.scrollHeight,
        behavior: "smooth",
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
      lastStreamActivityRef.current = Date.now();
      retryStalledStream({
        active,
        chats: chatsRef.current,
        preferences,
        mode,
        language: language || "en-US",
        uploadedAttachments,
        appendToAssistant,
        startStream,
      });
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
    return chat;
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
  async function send(
    content = input,
    resendAttachments?: UploadedAttachment[],
  ) {
    const text = interpolateSkillVariables(content.trim());
    if ((!text && !uploadedAttachments.length) || streaming) return;
    const enabledSkills = (skills || []).filter(isSkillEnabled);
    const availableSkills = preferences?.autoSelectSkills ? enabledSkills : [];
    const sentSkill =
      selectedSkill && isSkillEnabled(selectedSkill)
        ? interpolateSkillPackage(selectedSkill, interpolateSkillVariables)
        : undefined;
    const context = await buildSidepanelContext({
      mode,
      attachedTabs,
      selectedElement,
    });
    const chat = currentChat || createChat();
    const activeEdit =
      editingMessage?.chatId === chat.id ? editingMessage : null;
    const baseChat = activeEdit
      ? { ...chat, messages: activeEdit.messagesBefore, updatedAt: Date.now() }
      : chat;
    const sentTabs = attachedTabs;
    const sentElement = selectedElement;
    const sentAttachments = resendAttachments || pendingAttachments;
    const activeAttachments = uploadedAttachments;
    const assistantModel = assistantModelLabel({
      modelId: preferences?.selectedModelId,
      models: configuredModels,
    });
    const {
      userMessage,
      assistantMessage,
      shouldGenerateTitle,
      titleSource,
      nextChat,
    } = createSendMessagePlan({
      chat: baseChat,
      text,
      t,
      context,
      sources: baseChat.sources,
      assistantModel,
      sentTabs,
      sentElement,
      sentAttachments,
      skill: sentSkill,
      autoSelectedSkill: false,
    });
    if (sentAttachments.length)
      setSentAttachmentPreviews((items) => ({
        ...(activeEdit
          ? pruneSentAttachmentPreviews(items, activeEdit.keptMessageIds)
          : items),
        [userMessage.id]: sentAttachments,
      }));
    else if (activeEdit)
      setSentAttachmentPreviews((items) =>
        pruneSentAttachmentPreviews(items, activeEdit.keptMessageIds),
      );
    updateChat(nextChat);
    if (shouldGenerateTitle) requestChatTitle(nextChat.id, titleSource);
    setInput("");
    setAttachedTabs([]);
    clearPendingAttachments();
    setSelectedElement(null);
    setSelectedSkill(null);
    setEditingMessage(null);
    setStreaming(true);

    const request: AiStreamRequest = {
      type: AI_STREAM_REQUEST_TYPE.sendMessages,
      chatId: nextChat.id,
      messageId: assistantMessage.id,
      messages: [...baseChat.messages, userMessage],
      body: {
        modelId: preferences?.selectedModelId,
        chatMode: mode,
        language,
        maxToolSteps: preferences?.maxToolSteps ?? DEFAULT_MAX_TOOL_STEPS,
        context: {
          tabs: sentTabs,
          selectedElement: sentElement,
          text: context,
          uploadedAttachments: activeAttachments,
          availableSkills,
          sources: baseChat.sources || [],
          imageGenerationEnabled: preferences?.imageGenerationEnabled,
          autoSelectSkills: preferences?.autoSelectSkills,
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
    closeStreamPort(portRef, true);
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
      pendingAttachments={pendingAttachments}
      uploadedAttachments={uploadedAttachments}
      sentAttachmentPreviews={sentAttachmentPreviews}
      attachmentNotice={attachmentNotice}
      availableTabs={availableTabs}
      selectedElement={selectedElement}
      streaming={streaming}
      creatingSkill={creatingSkill}
      skillCreated={skillCreated}
      skills={(skills || []).filter(isSkillEnabled)}
      selectedSkill={selectedSkill}
      openMenu={openMenu}
      addMenuView={addMenuView}
      showHistory={showHistory}
      aiWorking={aiWorking}
      editingMessageId={editingMessage?.messageId}
      sidepanelRef={sidepanelRef}
      messagesRef={messagesRef}
      onSetInput={setInput}
      onSetMode={setMode}
      onSetOpenMenu={setOpenMenu}
      onSetAddMenuView={setAddMenuView}
      onSetShowHistory={setShowHistory}
      onSetSelectedElement={setSelectedElement}
      onSetSelectedSkill={setSelectedSkill}
      onSetChats={setChats}
      onSetPreferences={setPreferences}
      onCreateChat={createChat}
      onImportChat={(chat) => {
        setChats((items) => [...items, chat]);
        setActiveChatId(chat.id);
      }}
      onCloseChat={closeChat}
      onCreateSkill={() =>
        createSkillFromChat({
          currentChat,
          creatingSkill,
          modelId: preferences?.selectedModelId,
          setCreatingSkill,
          setSkillCreated,
          setSkills,
        })
      }
      onSend={send}
      onStop={stop}
      onSelectSkill={setSelectedSkill}
      onCancelEditMessage={cancelEditMessage}
      onShowAllTabsPicker={async () => {
        await showAllTabsPicker();
        setAddMenuView(ADD_MENU_VIEW.tabs);
      }}
      onToggleAttachedTab={toggleAttachedTab}
      onAttachActiveTab={attachActiveTab}
      onRemoveAttachedTab={removeAttachedTab}
      onAttachFiles={attachFiles}
      onRemoveUploadedAttachment={removeUploadedAttachment}
      onReplaceUploadedAttachment={replaceUploadedAttachment}
      onEditMessage={editMessage}
      onResendMessage={(message, attachments) =>
        send(message.content, attachments)
      }
      onSelectElement={selectElement}
      onSelectChat={setActiveChatId}
    />
  );
}

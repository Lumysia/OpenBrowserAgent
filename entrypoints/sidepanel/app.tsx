import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MAX_TOOL_STEPS } from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { isSkillEnabled } from "../../src/shared/skills";
import { storage } from "../../src/shared/storage";
import {
  AI_STREAM_REQUEST_TYPE,
  CHAT_MODE,
  type AiStreamRequest,
  type Chat,
  type ChatMessage,
  type ChatMode,
  type SendMessagesRequest,
  type Skill,
  type UploadedAttachment,
} from "../../src/shared/types";
import { useBuiltinSkills } from "../../src/ui/useBuiltinSkills";
import { useStoredState } from "../../src/ui/useStoredState";
import { requestGeneratedTitle } from "./ai-requests";
import {
  closeChatAction,
  createChatAction,
  forkChatAction,
  updateChatAction,
} from "./chat-state-actions";
import {
  createResendMessageDraft,
  pruneSentAttachmentPreviews,
} from "./edit-message";
import { assistantModelLabel } from "./model-label";
import { selectedElementImageAttachment } from "./selected-element-attachment";
import {
  buildSidepanelContext,
  interpolateSkillVariables,
} from "./sidepanel-context";
import {
  useAutoScroll,
  useActiveChatCleanup,
  useAutoRetryStream,
  useChatSelection,
  useSidepanelTheme,
} from "./sidepanel-effects";
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
import { createStreamHandlers } from "./stream-handlers";
import { closeStreamPort, startStreamAction } from "./stream-port";
import { useComposerContext } from "./use-composer-context";
import { useElementSelector } from "./use-element-selector";
import { useMessageEdit } from "./use-message-edit";
import { useQueuedMessages } from "./use-queued-messages";
import { createSkillFromChat } from "./use-skill-creator";
import { useUploadedAttachments } from "./use-uploaded-attachments";

export function SidepanelApp() {
  const [providers, , providersLoading] = useStoredState(storage.provider);
  const [ignoreSyncedProvidersForBootstrap] = useStoredState(
    storage.ignoreSyncedProvidersForBootstrap,
  );
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
      ignoreSyncedProvidersForBootstrap
        ? []
        : Object.values(providers || {}).flatMap(
            (provider) => provider?.models || [],
          ),
    [ignoreSyncedProvidersForBootstrap, providers],
  );
  const modelCount = configuredModels.length;
  const currentChat = chats?.find((chat) => chat.id === activeChatId);
  const streamHandlers = createStreamHandlers(setChats);
  const t = getMessages(language);
  const aiWorking = streaming || creatingSkill;
  const { selectElement } = useElementSelector(t);
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
    activeTabAttachable,
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
  const {
    queuedMessages,
    queueMessage: enqueueQueuedMessage,
    deleteQueuedMessage,
    editQueuedMessage,
  } = useQueuedMessages({
    streaming,
    creatingSkill,
    sendQueued: (content) => send(content, undefined, { queued: true }),
    onEditContent: setInput,
  });

  useEffect(() => void (aiWorking && setOpenMenu(null)), [aiWorking]);

  useBuiltinSkills(skills, setSkills);
  useEffect(() => {
    chatsRef.current = chats || [];
  }, [chats]);

  useSidepanelTheme(preferences?.accentColor, preferences?.colorScheme);

  useChatSelection(
    chats,
    activeChatId,
    initializedChatSelectionRef,
    setActiveChatId,
    createChat,
  );

  useActiveChatCleanup(
    activeChatId,
    clearUploadedAttachments,
    setEditingMessage,
    setSentAttachmentPreviews,
  );

  useAutoScroll(
    messagesRef,
    currentChat?.messages,
    preferences?.autoScroll,
    streaming,
  );

  useAutoRetryStream({
    streaming,
    autoRetry: preferences?.autoRetry,
    activeStreamRef,
    lastStreamActivityRef,
    chatsRef,
    preferences,
    mode,
    language,
    uploadedAttachments,
    appendToAssistant: streamHandlers.appendToAssistant,
    startStream,
  });

  function createChat() {
    return createChatAction({
      title: t.words.newChat,
      setChats,
      setActiveChatId,
    });
  }

  function closeChat(chatId: string) {
    closeChatAction({
      chatId,
      activeChatId,
      setChats,
      setActiveChatId,
    });
  }
  async function send(
    content = input,
    resendAttachments?: UploadedAttachment[],
    options: { queued?: boolean; resendMessage?: ChatMessage } = {},
  ) {
    const text = interpolateSkillVariables(content.trim());
    if ((!text && !uploadedAttachments.length) || streaming) {
      if (streaming && text) {
        enqueueQueuedMessage(content);
        if (content === input) setInput("");
      }
      return;
    }
    const enabledSkills = (skills || []).filter(isSkillEnabled);
    const availableSkills = preferences?.autoSelectSkills ? enabledSkills : [];
    const sentSkill =
      selectedSkill && isSkillEnabled(selectedSkill)
        ? interpolateSkillPackage(selectedSkill, interpolateSkillVariables)
        : undefined;
    const chat = currentChat || createChat();
    const resendDraft =
      !options.queued && options.resendMessage
        ? createResendMessageDraft({
            chat,
            message: options.resendMessage,
            attachments: resendAttachments || [],
          })
        : null;
    const activeEdit =
      !options.queued && editingMessage?.chatId === chat.id
        ? editingMessage
        : resendDraft;
    const sentTabs = options.queued
      ? []
      : activeEdit
        ? activeEdit.attachedTabs
        : attachedTabs;
    const sentElement = options.queued
      ? null
      : activeEdit
        ? activeEdit.selectedElement
        : selectedElement;
    const context = await buildSidepanelContext({
      mode,
      attachedTabs: sentTabs,
      selectedElement: sentElement,
    });
    const baseChat = activeEdit
      ? { ...chat, messages: activeEdit.messagesBefore, updatedAt: Date.now() }
      : chat;
    const selectedImageAttachment = selectedElementImageAttachment(sentElement);
    const sentAttachments = [
      ...(options.queued ? [] : resendAttachments || pendingAttachments),
      ...(selectedImageAttachment ? [selectedImageAttachment] : []),
    ];
    const activeAttachments = [
      ...(options.queued
        ? []
        : activeEdit
          ? activeEdit.attachments
          : uploadedAttachments),
      ...(selectedImageAttachment ? [selectedImageAttachment] : []),
    ];
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
    updateChatAction(setChats, nextChat);
    if (shouldGenerateTitle) requestChatTitle(nextChat.id, titleSource);
    if (!options.queued && !options.resendMessage) {
      setInput("");
      setAttachedTabs([]);
      clearPendingAttachments();
      setSelectedElement(null);
      setSelectedSkill(null);
      setEditingMessage(null);
    }
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
    startStreamAction({
      request,
      targetMessageId,
      portRef,
      activeStreamRef,
      lastStreamActivityRef,
      setStreaming,
      appendStreamChunk: streamHandlers.appendStreamChunk,
      appendToAssistant: streamHandlers.appendToAssistant,
      updateRunMetrics: (metrics) =>
        streamHandlers.updateRunMetrics(
          request.chatId,
          targetMessageId,
          metrics,
        ),
    });
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
      providersReady={!providersLoading}
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
      queuedMessages={queuedMessages}
      sentAttachmentPreviews={sentAttachmentPreviews}
      attachmentNotice={attachmentNotice}
      availableTabs={availableTabs}
      activeTabAttachable={activeTabAttachable}
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
      onDeleteQueuedMessage={deleteQueuedMessage}
      onEditQueuedMessage={editQueuedMessage}
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
        send(message.content, attachments, { resendMessage: message })
      }
      onForkMessage={(message) => {
        if (currentChat)
          forkChatAction({
            chat: currentChat,
            message,
            setChats,
            setActiveChatId,
          });
      }}
      onSelectElement={selectElement}
      onSelectChat={setActiveChatId}
    />
  );
}

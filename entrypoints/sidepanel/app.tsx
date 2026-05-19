import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MAX_TOOL_STEPS } from "../../src/shared/config";
import { resolveAgent } from "../../src/shared/agents";
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
  type RunMetrics,
  type SendMessagesRequest,
  type Skill,
  type UploadedAttachment,
} from "../../src/shared/types";
import { useBuiltinSkills } from "../../src/ui/useBuiltinSkills";
import { useStoredState } from "../../src/ui/useStoredState";
import { requestChatTitle } from "./ai-requests";
import {
  closeChatAction,
  createChatAction,
  forkChatAction,
  pruneEmptyChats,
  selectChatAction,
  updateChatAction,
} from "./chat-state-actions";
import {
  createResendMessageDraft,
  pruneSentAttachmentPreviews,
} from "./edit-message";
import { assistantModelLabel } from "./model-label";
import { selectedElementImageAttachments } from "./selected-element-attachment";
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
  type ActiveStreamMap,
  type ComposerMenu,
} from "./sidepanel-menu-state";
import { SidepanelView } from "./sidepanel-view";
import { createStreamHandlers } from "./stream-handlers";
import {
  attachStreamAction,
  closeStreamPort,
  startStreamAction,
} from "./stream-port";
import { useComposerContext } from "./use-composer-context";
import { useElementSelector } from "./use-element-selector";
import { useMessageEdit } from "./use-message-edit";
import { usePromptUsageEstimate } from "./prompt-usage-preview";
import { useQueuedMessages } from "./use-queued-messages";
import { useUploadedAttachments } from "./use-uploaded-attachments";

export function SidepanelApp() {
  const [providers, , providersLoading] = useStoredState(storage.provider);
  const [ignoreSyncedProvidersForBootstrap] = useStoredState(
    storage.ignoreSyncedProvidersForBootstrap,
  );
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [agents] = useStoredState(storage.agents);
  const [language] = useStoredState(storage.language);
  const [skills, setSkills] = useStoredState(storage.skills);
  const [selectedSkills, setSelectedSkills] = useState<Skill[]>([]);
  const [chats, setChats] = useStoredState(storage.chats);
  const [activeChatId, setActiveChatId] = useState<string>();
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({});
  const [unreadCompletedChats, setUnreadCompletedChats] = useState<
    Record<string, true>
  >({});
  const [mode, setMode] = useState<ChatMode>(CHAT_MODE.agent);
  const [activeStreams, setActiveStreamsState] = useState<ActiveStreamMap>({});
  const [openMenu, setOpenMenu] = useState<ComposerMenu | null>(null);
  const [addMenuView, setAddMenuView] = useState<AddMenuView>("menu");
  const [showHistory, setShowHistory] = useState(false);
  const [sentAttachmentPreviews, setSentAttachmentPreviews] = useState<
    Record<string, UploadedAttachment[]>
  >({});
  const portRefs = useRef<Record<string, chrome.runtime.Port | undefined>>({});
  const sidepanelRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const chatsRef = useRef<Chat[]>([]);
  const activeChatIdRef = useRef<string | undefined>(undefined);
  const initializedChatSelectionRef = useRef(false);
  const lastStreamActivityRef = useRef<Record<string, number>>({});
  const activeStreamsRef = useRef<ActiveStreamMap>({});
  const setActiveStreams: typeof setActiveStreamsState = useCallback(
    (value) => {
      setActiveStreamsState((items) => {
        const next = typeof value === "function" ? value(items) : value;
        activeStreamsRef.current = next;
        return next;
      });
    },
    [],
  );
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
  const inputDraftKey = activeChatId || "new";
  const input = inputDrafts[inputDraftKey] || "";
  const setInput = useCallback(
    (value: string) => {
      setInputDrafts((items) => ({ ...items, [inputDraftKey]: value }));
    },
    [inputDraftKey],
  );
  const clearInput = useCallback(() => {
    setInputDrafts((items) => {
      const next = { ...items };
      delete next[inputDraftKey];
      return next;
    });
  }, [inputDraftKey]);
  const activeAgent = resolveAgent(agents, preferences?.selectedAgentId);
  const streamHandlers = useMemo(
    () => createStreamHandlers(setChats),
    [setChats],
  );
  const t = getMessages(language);
  const streaming = Object.keys(activeStreams).length > 0;
  const currentChatStreaming = !!(currentChat && activeStreams[currentChat.id]);
  const aiWorking = currentChatStreaming;
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
    selectedElements,
    setAttachedTabs,
    clearComposerContext,
    clearAttachedTabsAfterSend,
    setSelectedElements,
    attachActiveTab,
    showAllTabsPicker,
    toggleAttachedTab,
    removeAttachedTab,
  } = useComposerContext(chats || []);
  const promptUsage = usePromptUsageEstimate({
    input,
    mode,
    currentChat,
    preferences,
    attachedTabs,
    selectedElements,
    pendingAttachments,
    uploadedAttachments,
    selectedSkills,
    agent: activeAgent,
    skills: skills || [],
  });
  const { editingMessage, setEditingMessage, editMessage, cancelEditMessage } =
    useMessageEdit({
      currentChat,
      streaming: currentChatStreaming,
      input,
      pendingAttachments,
      attachedTabs,
      selectedElements,
      selectedSkills,
      setInput,
      setAttachedTabs,
      setSelectedElements,
      setSelectedSkills,
      stageUploadedAttachments,
    });
  const {
    queuedMessages,
    queueMessage: enqueueQueuedMessage,
    deleteQueuedMessage,
    removeQueuedMessage,
    editQueuedMessage,
  } = useQueuedMessages({
    chatId: currentChat?.id,
    streaming: currentChatStreaming,
    sendQueued: (content) => send(content, undefined, { queued: true }),
    onEditContent: setInput,
    onQueueMessage: (message) =>
      currentChat &&
      portRefs.current[currentChat.id]?.postMessage({
        type: AI_STREAM_REQUEST_TYPE.queueMessage,
        id: message.id,
        content: message.content,
      }),
    onRemoveMessage: (id) =>
      currentChat &&
      portRefs.current[currentChat.id]?.postMessage({
        type: AI_STREAM_REQUEST_TYPE.deleteQueuedMessage,
        id,
      }),
  });

  useEffect(() => void (aiWorking && setOpenMenu(null)), [aiWorking]);

  useBuiltinSkills(skills, setSkills);
  useEffect(() => {
    chatsRef.current = chats || [];
  }, [chats]);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
    if (!activeChatId) return;
    setUnreadCompletedChats((items) => {
      if (!items[activeChatId]) return items;
      const next = { ...items };
      delete next[activeChatId];
      return next;
    });
  }, [activeChatId]);
  useEffect(() => {
    if (!chats?.some((chat) => !chat.messages.length)) return;
    setChats((items) => pruneEmptyChats(items));
  }, [chats, setChats]);

  useSidepanelTheme(preferences?.accentColor, preferences?.colorScheme);

  const createChat = () =>
    createChatAction({
      title: t.words.newChat,
      persist: false,
      setChats,
      setActiveChatId,
    });

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
    clearComposerContext,
    setSelectedElements,
    setSelectedSkills,
    setOpenMenu,
  );

  useAutoScroll(
    messagesRef,
    currentChat?.messages,
    preferences?.autoScroll,
    currentChatStreaming,
  );

  useAutoRetryStream({
    streaming,
    autoRetry: preferences?.autoRetry,
    activeStreamsRef,
    lastStreamActivityRef,
    chatsRef,
    preferences,
    mode,
    language,
    uploadedAttachments,
    agent: activeAgent,
    appendToAssistant: streamHandlers.appendToAssistant,
    startStream,
  });

  useEffect(() => {
    if (!currentChat || activeStreams[currentChat.id]) return;
    const message = resumableAssistantMessage(currentChat);
    if (!message) return;
    setActiveStreams((items) => ({
      ...items,
      [currentChat.id]: {
        chatId: currentChat.id,
        assistantMessageId: message.id,
        retryCount: 0,
        hasProgress: true,
      },
    }));
    const metrics = message.metadata?.runMetrics as RunMetrics | undefined;
    attachStream(currentChat.id, message.id, metrics?.streamEventIndex);
  }, [activeStreams, currentChat, setActiveStreams]);

  function closeChat(chatId: string) {
    if (activeStreams[chatId]) {
      closeStreamPort(portRefs, chatId, true);
      setActiveStreams((items) => {
        const next = { ...items };
        delete next[chatId];
        return next;
      });
    }
    closeChatAction({
      chatId,
      activeChatId,
      setChats,
      setActiveChatId,
    });
    setUnreadCompletedChats((items) => {
      if (!items[chatId]) return items;
      const next = { ...items };
      delete next[chatId];
      return next;
    });
  }

  function selectChat(chatId: string) {
    selectChatAction({ chatId, setChats, setActiveChatId });
  }
  function markStreamFinished(chatId: string) {
    if (activeChatIdRef.current === chatId) return;
    setUnreadCompletedChats((items) => ({ ...items, [chatId]: true }));
  }
  async function send(
    content = input,
    resendAttachments?: UploadedAttachment[],
    options: { queued?: boolean; resendMessage?: ChatMessage } = {},
  ) {
    const text = interpolateSkillVariables(content.trim());
    if ((!text && !uploadedAttachments.length) || currentChatStreaming) {
      if (currentChatStreaming && text) {
        enqueueQueuedMessage(content);
        if (content === input) clearInput();
      }
      return;
    }
    const enabledSkills = (skills || []).filter(isSkillEnabled);
    const availableSkills = preferences?.autoSelectSkills ? enabledSkills : [];
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
    const sentElements = options.queued
      ? []
      : activeEdit
        ? activeEdit.selectedElements
        : selectedElements;
    const sentSkills = (
      options.queued ? [] : activeEdit ? activeEdit.skills : selectedSkills
    )
      .filter(isSkillEnabled)
      .map((skill) =>
        interpolateSkillPackage(skill, interpolateSkillVariables),
      );
    const context = await buildSidepanelContext({
      mode,
      attachedTabs: sentTabs,
      selectedElements: sentElements,
    });
    const baseChat = activeEdit
      ? {
          ...chat,
          messages: activeEdit.messagesBefore,
          sources: activeEdit.sourcesBefore,
          updatedAt: Date.now(),
        }
      : chat;
    const selectedImageAttachments =
      selectedElementImageAttachments(sentElements);
    const sentAttachments = [
      ...(options.queued ? [] : resendAttachments || pendingAttachments),
      ...selectedImageAttachments,
    ];
    const activeAttachments = [
      ...(options.queued
        ? []
        : activeEdit
          ? activeEdit.attachments
          : uploadedAttachments),
      ...selectedImageAttachments,
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
      sentElements,
      sentAttachments,
      skills: sentSkills,
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
    if (shouldGenerateTitle)
      requestChatTitle({
        chatId: nextChat.id,
        modelId: preferences?.selectedModelId,
        message: titleSource,
        setChats,
      });
    if (!options.queued && !options.resendMessage) {
      clearInput();
      clearAttachedTabsAfterSend();
      clearPendingAttachments();
      setSelectedElements([]);
      setSelectedSkills([]);
      setEditingMessage(null);
    }
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
          selectedElements: sentElements,
          text: context,
          uploadedAttachments: activeAttachments,
          availableSkills,
          sources: baseChat.sources || [],
          agent: activeAgent,
          imageGenerationEnabled: preferences?.imageGenerationEnabled,
          autoSelectSkills: preferences?.autoSelectSkills,
        },
      },
    };
    setActiveStreams((items) => ({
      ...items,
      [nextChat.id]: {
        chatId: nextChat.id,
        assistantMessageId: assistantMessage.id,
        retryCount: 0,
        hasProgress: false,
      },
    }));
    lastStreamActivityRef.current[nextChat.id] = Date.now();
    startStream(request, assistantMessage.id);
  }

  function startStream(request: SendMessagesRequest, targetMessageId: string) {
    startStreamAction({
      request,
      targetMessageId,
      portRefs,
      activeStreamsRef,
      lastStreamActivityRef,
      setActiveStreams,
      onStreamFinished: markStreamFinished,
      appendStreamChunk: streamHandlers.appendStreamChunk,
      appendToAssistant: streamHandlers.appendToAssistant,
      appendQueuedMessages: streamHandlers.appendQueuedMessages,
      removeQueuedMessage,
      updateRunMetrics: (id, metrics) =>
        streamHandlers.updateRunMetrics(request.chatId, id, metrics),
    });
  }

  function attachStream(
    chatId: string,
    targetMessageId: string,
    afterSequence?: number,
  ) {
    attachStreamAction({
      chatId,
      targetMessageId,
      afterSequence,
      portRefs,
      activeStreamsRef,
      lastStreamActivityRef,
      setActiveStreams,
      onStreamFinished: markStreamFinished,
      appendStreamChunk: streamHandlers.appendStreamChunk,
      appendToAssistant: streamHandlers.appendToAssistant,
      appendQueuedMessages: streamHandlers.appendQueuedMessages,
      removeQueuedMessage,
      updateRunMetrics: (id, metrics) =>
        streamHandlers.updateRunMetrics(chatId, id, metrics),
    });
  }

  function stop() {
    if (!currentChat) return;
    const activeStream = activeStreams[currentChat.id];
    if (activeStream)
      streamHandlers.updateRunMetrics(
        activeStream.chatId,
        activeStream.assistantMessageId,
        { endedAt: Date.now() },
      );
    setActiveStreams((items) => {
      const next = { ...items };
      delete next[currentChat.id];
      return next;
    });
    closeStreamPort(portRefs, currentChat.id, true);
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
      promptUsage={promptUsage}
      mode={mode}
      attachedTabs={attachedTabs}
      pendingAttachments={pendingAttachments}
      uploadedAttachments={uploadedAttachments}
      queuedMessages={currentChatStreaming ? queuedMessages : []}
      sentAttachmentPreviews={sentAttachmentPreviews}
      attachmentNotice={attachmentNotice}
      availableTabs={availableTabs}
      activeTabAttachable={activeTabAttachable}
      selectedElements={selectedElements}
      streaming={currentChatStreaming}
      unreadCompletedChatIds={unreadCompletedChats}
      skills={(skills || []).filter(isSkillEnabled)}
      agents={agents || []}
      selectedSkills={selectedSkills}
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
      onSetSelectedElements={setSelectedElements}
      onSetSelectedSkills={setSelectedSkills}
      onSetChats={setChats}
      onSetPreferences={setPreferences}
      onCreateChat={createChat}
      onImportChat={(chat) => {
        setChats((items) => [...pruneEmptyChats(items), chat]);
        setActiveChatId(chat.id);
      }}
      onCloseChat={closeChat}
      onSend={send}
      onStop={stop}
      onDeleteQueuedMessage={deleteQueuedMessage}
      onEditQueuedMessage={editQueuedMessage}
      onToggleSkill={(skill) =>
        setSelectedSkills((items) =>
          items.some((item) => item.id === skill.id)
            ? items.filter((item) => item.id !== skill.id)
            : [...items, skill],
        )
      }
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
      onForkMessage={(message, partId) => {
        if (currentChat)
          forkChatAction({
            chat: currentChat,
            message,
            partId,
            forkLabel: t.sidepanel.forkTitleSuffix,
            setChats,
            setActiveChatId,
          });
      }}
      onSelectElement={selectElement}
      onSelectChat={selectChat}
    />
  );
}

function resumableAssistantMessage(chat: Chat) {
  return [...chat.messages].reverse().find((message) => {
    const metrics = message.metadata?.runMetrics as { endedAt?: unknown };
    return message.role === "assistant" && !metrics?.endedAt;
  });
}

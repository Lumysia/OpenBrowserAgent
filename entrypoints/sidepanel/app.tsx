import { useEffect, useRef, useState } from "react";
import { resolveAgent } from "../../src/shared/agents";
import { getMessages } from "../../src/shared/i18n";
import { isSkillEnabled } from "../../src/shared/skills";
import { storage } from "../../src/shared/storage";
import type {
  Chat,
  ChatMessage,
  Skill,
  UploadedAttachment,
} from "../../src/shared/types";
import { useBuiltinSkills } from "../../src/ui/useBuiltinSkills";
import { useStoredState } from "../../src/ui/useStoredState";
import { requestChatTitle } from "./ai-requests";
import { createChatDraft } from "./chat-state-actions";
import { pruneSentAttachmentPreviews } from "./edit-message";
import { toggleSkill } from "./skill-context";
import { assistantModelLabel } from "./model-label";
import {
  buildSidepanelContext,
  interpolateSkillVariables,
} from "./sidepanel-context";
import {
  useAutoScroll,
  useActiveChatCleanup,
  useChatSelection,
  useSidepanelTheme,
} from "./sidepanel-effects";
import {
  createSendMessagePlan,
  pickSendInputs,
  sendMessagesRequest,
} from "./send-message-plan";
import {
  ADD_MENU_VIEW,
  type AddMenuView,
  type ComposerMenu,
} from "./sidepanel-menu-state";
import { SidepanelView } from "./sidepanel-view";
import { agentForChatRuntime } from "./sub-agent-runtime";
import { useChatActions } from "./use-chat-actions";
import { useChats } from "./use-chats";
import { useCurrentChat, useRetainedChats } from "./use-current-chat";
import { useComposerContext } from "./use-composer-context";
import { useChatDraft } from "./use-chat-drafts";
import { useConfiguredModels as useModels } from "./use-configured-models";
import { useElementSelector } from "./use-element-selector";
import { useMessageEdit } from "./use-message-edit";
import { useParallelChatStreams } from "./use-parallel-chat-streams";
import { usePromptUsageEstimate } from "./prompt-usage-preview";
import { useQueuedMessages } from "./use-queued-messages";
import { useRemoteSyncRefresh } from "../../src/ui/useRemoteSyncRefresh";
import {
  type SubAgentHandler,
  useSubAgentLauncher,
} from "./use-sub-agent-launcher";
import { useSyncedChatAttachments } from "./use-synced-chat-attachments";
import { useUnreadCompletedChats } from "./use-unread-completed-chats";
import { useUploadedAttachments } from "./use-uploaded-attachments";

export function SidepanelApp() {
  const [providers, , providersLoading] = useStoredState(storage.provider);
  const [ignoreSyncedBootstrap] = useStoredState(
    storage.ignoreSyncedProvidersForBootstrap,
  );
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [syncDataSettings] = useStoredState(storage.syncDataSettings);
  const [syncWriteStatus] = useStoredState(storage.syncWriteStatus);
  const [agents] = useStoredState(storage.agents);
  const [language] = useStoredState(storage.language);
  const [skills, setSkills] = useStoredState(storage.skills);
  const [selectedSkills, setSelectedSkills] = useState<Skill[]>([]);
  const chatState = useChats();
  const chats = chatState.summaries;
  const t = getMessages(language);
  // The composer owns a draft chat before history loads, so text typed early
  // and an early send keep one chat ID.
  const [draftChat, setDraftChat] = useState<Chat | undefined>(() =>
    createChatDraft(t.words.newChat),
  );
  const [activeChatId, setActiveChatId] = useState(draftChat?.id);
  const [openMenu, setOpenMenu] = useState<ComposerMenu | null>(null);
  const [addMenuView, setAddMenuView] = useState<AddMenuView>("menu");
  const [showHistory, setShowHistory] = useState(false);
  const [chatSelectionRequestId, setChatSelectionRequestId] = useState(0);
  const sendInFlightRef = useRef<Set<string>>(new Set());
  const [sentAttachmentPreviews, setSentAttachmentPreviews] = useState<
    Record<string, UploadedAttachment[]>
  >({});
  const sidepanelRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const initializedChatSelectionRef = useRef(false);
  const configuredModels = useModels(providers, ignoreSyncedBootstrap);
  const { currentChat, currentChatStatus, retryCurrentChat } = useCurrentChat({
    chats: chatState,
    activeChatId,
    draftChat,
    setDraftChat,
  });
  const { input, setInput, clearInput } = useChatDraft(activeChatId);
  const {
    unreadCompletedChats,
    setUnreadCompletedChats,
    clearUnreadCompletedChat,
  } = useUnreadCompletedChats(activeChatId);
  const selectedAgent = resolveAgent(agents, preferences?.selectedAgentId);
  const activeAgent = resolveAgent(
    agents,
    currentChat?.kind === "subagent" ? currentChat.agentId : selectedAgent.id,
  );
  const runtimeAgent = agentForChatRuntime(activeAgent, currentChat);
  const subAgentLauncherRef = useRef<SubAgentHandler | undefined>(undefined);
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
    streamingChatIds,
    currentChatStreaming,
    currentAssistantMessageId,
    beginStream,
    startStream,
    abortClosedChatStreams,
    stopCurrentStream,
    postQueuedMessage,
    deleteQueuedStreamMessage,
    answerQuestion,
    setQueuedMessageRemover,
  } = useParallelChatStreams({
    activeChatId,
    currentChat,
    summariesRef: chatState.summariesRef,
    getChat: chatState.getChat,
    preferences,
    language,
    uploadedAttachments,
    agent: runtimeAgent,
    updateChat: chatState.updateChat,
    setUnreadCompletedChats,
    onStreamChunk: (event) => subAgentLauncherRef.current?.(event),
  });
  const handleSubAgentStreamChunk = useSubAgentLauncher({
    chats,
    agents,
    preferences,
    configuredModels,
    skills,
    language,
    t,
    saveChats: chatState.saveChats,
    beginStream,
    startStream,
  });
  subAgentLauncherRef.current = handleSubAgentStreamChunk;
  useRetainedChats(chatState, activeChatId, streamingChatIds);
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
  } = useComposerContext();
  const promptUsage = usePromptUsageEstimate({
    input,
    agent: runtimeAgent,
    currentChat,
    preferences,
    attachedTabs,
    selectedElements,
    pendingAttachments,
    uploadedAttachments,
    selectedSkills,
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
      postQueuedMessage(currentChat.id, message.id, message.content),
    onRemoveMessage: (id, chatId) => deleteQueuedStreamMessage(chatId, id),
  });

  useEffect(() => {
    setQueuedMessageRemover((id, chatId) => removeQueuedMessage(id, chatId));
  }, [removeQueuedMessage, setQueuedMessageRemover]);

  const { syncSentAttachments } = useSyncedChatAttachments({
    currentChat,
    syncDataSettings,
    sentAttachmentPreviews,
    setSentAttachmentPreviews,
  });

  useEffect(
    () => void (currentChatStreaming && setOpenMenu(null)),
    [currentChatStreaming],
  );

  useBuiltinSkills(skills, setSkills);

  useSidepanelTheme(preferences?.accentColor, preferences?.colorScheme);
  useRemoteSyncRefresh(syncDataSettings);

  const { createChat, closeChat, selectChat, importChat, forkMessage } =
    useChatActions({
      t,
      chats: chatState,
      syncDataSettings,
      setDraftChat,
      setActiveChatId,
      setChatSelectionRequestId,
      abortClosedChatStreams,
      clearUnreadCompletedChat,
    });

  useChatSelection(
    chats,
    activeChatId,
    draftChat?.id,
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
    activeChatId,
    chatSelectionRequestId,
  );

  async function send(
    content = input,
    resendAttachments?: UploadedAttachment[],
    options: { queued?: boolean; resendMessage?: ChatMessage } = {},
  ) {
    const text = interpolateSkillVariables(content.trim());
    const sendChatId = currentChat?.id || activeChatId || "new";
    if (
      currentChatStatus !== "ready" ||
      (!text && !uploadedAttachments.length) ||
      currentChatStreaming ||
      sendInFlightRef.current.has(sendChatId)
    ) {
      if (currentChatStreaming && text && !options.resendMessage) {
        enqueueQueuedMessage(content);
        if (content === input) clearInput();
      }
      return;
    }
    sendInFlightRef.current.add(sendChatId);
    try {
      const availableSkills = runtimeAgent.capabilities.skillTools
        ? (skills || []).filter(isSkillEnabled)
        : [];
      const chat = currentChat || createChat();
      const {
        activeEdit,
        baseChat,
        sentTabs,
        sentElements,
        sentSkills,
        sentAttachments,
        activeAttachments,
      } = pickSendInputs({
        chat,
        queued: !!options.queued,
        editingMessage,
        resendMessage: options.resendMessage,
        attachedTabs,
        selectedElements,
        selectedSkills,
        resendAttachments,
        pendingAttachments,
        uploadedAttachments,
      });
      const context = await buildSidepanelContext({
        attachedTabs: sentTabs,
        selectedElements: sentElements,
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
        assistantModel: assistantModelLabel({
          modelId: preferences?.selectedModelId,
          models: configuredModels,
        }),
        sentTabs,
        sentElements,
        sentAttachments,
        skills: sentSkills,
        autoSelectedSkill: false,
      });
      if (sentAttachments.length || activeEdit)
        setSentAttachmentPreviews((items) => {
          const kept = activeEdit
            ? pruneSentAttachmentPreviews(items, activeEdit.keptMessageIds)
            : items;
          return sentAttachments.length
            ? { ...kept, [userMessage.id]: sentAttachments }
            : kept;
        });
      syncSentAttachments({
        chatId: nextChat.id,
        messageId: userMessage.id,
        attachments: sentAttachments,
      });
      beginStream(nextChat.id, assistantMessage.id);
      const initialSnapshotPersist = chatState
        .storeChat(nextChat)
        .catch((error) =>
          console.warn("Failed to persist initial chat snapshot", error),
        );
      if (!options.queued && !options.resendMessage) {
        clearInput();
        clearAttachedTabsAfterSend();
        clearPendingAttachments();
        setSelectedElements([]);
        setSelectedSkills([]);
        setEditingMessage(null);
      }
      await initialSnapshotPersist;
      if (shouldGenerateTitle)
        requestChatTitle({
          chatId: nextChat.id,
          modelId: preferences?.selectedModelId,
          message: titleSource,
          setSummaries: chatState.setSummaries,
        });
      const request = sendMessagesRequest({
        chatId: nextChat.id,
        messageId: assistantMessage.id,
        messages: [...baseChat.messages, userMessage],
        preferences,
        agent: runtimeAgent,
        language,
        context: {
          tabs: sentTabs,
          selectedElements: sentElements,
          text: context,
          uploadedAttachments: activeAttachments,
          availableSkills,
          sources: baseChat.sources || [],
        },
      });
      startStream(request, assistantMessage.id);
    } finally {
      sendInFlightRef.current.delete(sendChatId);
    }
  }

  return (
    <SidepanelView
      t={t}
      providersReady={!providersLoading}
      modelCount={configuredModels.length}
      activeChatId={activeChatId}
      currentChat={currentChat}
      currentChatStatus={currentChatStatus}
      chats={chats || []}
      preferences={preferences}
      configuredModels={configuredModels}
      input={input}
      promptUsage={promptUsage}
      activeAgent={runtimeAgent}
      syncWriteStatus={syncWriteStatus}
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
      activeAssistantMessageId={currentAssistantMessageId}
      unreadCompletedChatIds={unreadCompletedChats}
      skills={(skills || []).filter(isSkillEnabled)}
      agents={agents || []}
      selectedSkills={selectedSkills}
      openMenu={openMenu}
      addMenuView={addMenuView}
      showHistory={showHistory}
      aiWorking={currentChatStreaming}
      editingMessageId={editingMessage?.messageId}
      sidepanelRef={sidepanelRef}
      messagesRef={messagesRef}
      onSetInput={setInput}
      onSetOpenMenu={setOpenMenu}
      onSetAddMenuView={setAddMenuView}
      onSetShowHistory={setShowHistory}
      onSetSelectedElements={setSelectedElements}
      onSetSelectedSkills={setSelectedSkills}
      onSetChats={chatState.setSummaries}
      onLoadChat={chatState.loadChat}
      onRetryChat={retryCurrentChat}
      onSetPreferences={setPreferences}
      onCreateChat={createChat}
      onImportChat={importChat}
      onCloseChat={closeChat}
      onSend={send}
      onStop={stopCurrentStream}
      onDeleteQueuedMessage={deleteQueuedMessage}
      onEditQueuedMessage={editQueuedMessage}
      onAnswerQuestion={(toolCallId, answers) =>
        currentChat && answerQuestion(currentChat.id, toolCallId, answers)
      }
      onToggleSkill={(skill) =>
        setSelectedSkills((items) => toggleSkill(items, skill))
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
      onForkMessage={(message, partId) =>
        forkMessage(currentChat, message, partId)
      }
      onSelectElement={selectElement}
      onSelectChat={selectChat}
    />
  );
}

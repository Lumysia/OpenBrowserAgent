import { useEffect, useRef, useState } from "react";
import { resolveAgent } from "../../src/shared/agents";
import { getMessages } from "../../src/shared/i18n";
import { availableSkills } from "../../src/shared/skill-catalog";
import { storage } from "../../src/shared/storage";
import type {
  Chat,
  ChatMessage,
  PickedSkill,
  UploadedAttachment,
} from "../../src/shared/types";
import { useSkillCatalog } from "../../src/ui/useSkillCatalog";
import { useStoredState } from "../../src/ui/useStoredState";
import { useTheme } from "../../src/ui/theme";
import { celebrateSend } from "./holiday-touches";
import { requestChatTitle } from "./ai-requests";
import { createChatDraft } from "./chat-state-actions";
import { pruneSentAttachmentPreviews } from "./edit-message";
import { addSkill, messageToSend, toggleSkill } from "./skill-context";
import { chatModelLabel } from "./model-label";
import { buildSidepanelContext } from "./sidepanel-context";
import {
  useAutoScroll,
  useActiveChatCleanup,
  useChatSelection,
} from "./sidepanel-effects";
import {
  createSendMessagePlan,
  messageInstruction,
  pickSendInputs,
  sendMessagesRequest,
  type SendRequest,
} from "./send-message-plan";
import {
  ADD_MENU_VIEW,
  type AddMenuView,
  type ComposerMenu,
} from "./sidepanel-menu-state";
import { SidepanelView } from "./sidepanel-view";
import { useChatActions } from "./use-chat-actions";
import { useChats } from "./use-chats";
import { useCurrentChat, useRetainedChats } from "./use-current-chat";
import { useComposerContext } from "./use-composer-context";
import { useChatDraft } from "./use-chat-drafts";
import { useConfiguredModels as useModels } from "./use-configured-models";
import { useElementSelector } from "./use-element-selector";
import { useMessageEdit } from "./use-message-edit";
import { useProviderConsent } from "./provider-consent-prompt";
import { useParallelChatStreams } from "./use-parallel-chat-streams";
import { useQueuedMessages } from "./use-queued-messages";
import { useSyncPageState } from "../../src/ui/useSyncPageState";
import { useSidePanelHandoff } from "./use-side-panel-handoff";
import { useChatAttachments } from "./use-chat-attachments";
import { useUnreadCompletedChats } from "./use-unread-completed-chats";
import { useUploadedAttachments } from "./use-uploaded-attachments";

export function SidepanelApp() {
  const [providers, , providersLoading] = useStoredState(storage.provider);
  const [ignoreSyncedBootstrap] = useStoredState(
    storage.ignoreSyncedProvidersForBootstrap,
  );
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [syncStatus] = useStoredState(storage.syncStatus);
  const [agents] = useStoredState(storage.agents);
  const [language] = useStoredState(storage.language);
  const { entries: skillEntries } = useSkillCatalog();
  const skills = availableSkills(skillEntries || []);
  const [selectedSkills, setSelectedSkills] = useState<PickedSkill[]>([]);
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
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
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
  const { selectElement } = useElementSelector(t);
  const consent = useProviderConsent(t, providers, preferences, activeAgent);
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
    stoppedRuns,
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
    agent: activeAgent,
    updateChat: chatState.updateChat,
    setUnreadCompletedChats,
  });
  useRetainedChats(chatState, activeChatId, streamingChatIds);
  const {
    attachedTabs,
    availableTabs,
    activeTabAttachable,
    selectedElements,
    selectedTexts,
    setAttachedTabs,
    clearComposerContext,
    clearComposerContextAfterSend,
    setSelectedElements,
    setSelectedTexts,
    attachSelectedText,
    removeSelectedText,
    attachActiveTab,
    attachTab,
    showAllTabsPicker,
    toggleAttachedTab,
    removeAttachedTab,
  } = useComposerContext();
  const { editingMessage, setEditingMessage, editMessage, cancelEditMessage } =
    useMessageEdit({
      currentChat,
      streaming: currentChatStreaming,
      input,
      pendingAttachments,
      attachedTabs,
      selectedElements,
      selectedTexts,
      selectedSkills,
      setInput,
      setAttachedTabs,
      setSelectedElements,
      setSelectedTexts,
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

  const { storeSentAttachments } = useChatAttachments({
    currentChat,
    sentAttachmentPreviews,
    setSentAttachmentPreviews,
  });

  useEffect(
    () => void (currentChatStreaming && setOpenMenu(null)),
    [currentChatStreaming],
  );

  useTheme(document.documentElement, preferences ?? {});
  useSyncPageState();

  const { createChat, closeChat, selectChat, importChat, forkMessage } =
    useChatActions({
      t,
      chats: chatState,
      setDraftChat,
      setActiveChatId,
      setChatSelectionRequestId,
      abortClosedChatStreams,
      clearUnreadCompletedChat,
    });

  useSidePanelHandoff({
    ready: !!chats && language !== undefined,
    t,
    language: language || "",
    importChat,
    createChat,
    attachTab,
    attachSelectedText,
    currentChatId: currentChat?.id,
    canSend: currentChatStatus === "ready" && !currentChatStreaming,
    send: ({ content, ...request }) => send(content, undefined, { request }),
    composerRef,
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
    options: {
      queued?: boolean;
      resendMessage?: ChatMessage;
      // A context menu or smart bar request: its own tabs and instruction.
      request?: SendRequest;
    } = {},
  ) {
    const { request: sendRequest } = options;
    const { slash, text } = messageToSend(
      content,
      skills,
      sendRequest ? "request" : options.resendMessage ? "resend" : "typed",
    );
    const sendChatId = currentChat?.id || activeChatId || "new";
    if (
      currentChatStatus !== "ready" ||
      (!text &&
        !uploadedAttachments.length &&
        !slash &&
        !(selectedSkills.length && !options.queued)) ||
      currentChatStreaming ||
      sendInFlightRef.current.has(sendChatId)
    ) {
      if (currentChatStreaming && text && !options.resendMessage) {
        enqueueQueuedMessage(content);
        if (content === input) clearInput();
      }
      return;
    }
    // Asks first when a provider it uses lacks the user's permission.
    if (!(await consent.confirmSend(!currentChat?.messages.length))) return;
    sendInFlightRef.current.add(sendChatId);
    void celebrateSend(preferences).catch(console.warn);
    try {
      const chat = currentChat || createChat();
      const {
        activeEdit,
        baseChat,
        sentTabs,
        sentElements,
        sentTexts,
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
        selectedTexts,
        selectedSkills,
        resendAttachments,
        pendingAttachments,
        uploadedAttachments,
        request: sendRequest,
      });
      const context = await buildSidepanelContext({
        attachedTabs: sentTabs,
        selectedElements: sentElements,
        selectedTexts: sentTexts,
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
        assistantModel: chatModelLabel(
          activeAgent,
          preferences,
          configuredModels,
        ),
        sentTabs,
        sentElements,
        sentTexts,
        sentAttachments,
        skills: slash ? addSkill(sentSkills, slash.skill) : sentSkills,
        instruction:
          sendRequest?.instruction ?? messageInstruction(options.resendMessage),
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
      storeSentAttachments({
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
        clearComposerContextAfterSend();
        clearPendingAttachments();
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
        chat: nextChat,
        messageId: assistantMessage.id,
        messages: [...baseChat.messages, userMessage],
        preferences,
        agent: activeAgent,
        language,
        uploadedAttachments: activeAttachments,
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
      activeAgent={activeAgent}
      syncStatus={syncStatus}
      attachedTabs={attachedTabs}
      pendingAttachments={pendingAttachments}
      uploadedAttachments={uploadedAttachments}
      queuedMessages={currentChatStreaming ? queuedMessages : []}
      sentAttachmentPreviews={sentAttachmentPreviews}
      attachmentNotice={attachmentNotice}
      availableTabs={availableTabs}
      activeTabAttachable={activeTabAttachable}
      selectedElements={selectedElements}
      selectedTexts={selectedTexts}
      streaming={currentChatStreaming}
      activeAssistantMessageId={currentAssistantMessageId}
      stoppedRuns={stoppedRuns}
      unreadCompletedChatIds={unreadCompletedChats}
      skills={skills}
      agents={agents || []}
      selectedSkills={selectedSkills}
      openMenu={openMenu}
      addMenuView={addMenuView}
      showHistory={showHistory}
      aiWorking={currentChatStreaming}
      editingMessageId={editingMessage?.messageId}
      sidepanelRef={sidepanelRef}
      messagesRef={messagesRef}
      composerRef={composerRef}
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
      consentPrompt={consent.prompt}
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
      onRemoveSelectedText={removeSelectedText}
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

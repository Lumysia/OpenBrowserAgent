import { useEffect, useRef, useState } from "react";
import { DEFAULT_MAX_TOOL_STEPS } from "../../src/shared/config";
import { resolveAgent } from "../../src/shared/agents";
import { getMessages } from "../../src/shared/i18n";
import { isSkillEnabled } from "../../src/shared/skills";
import { storage } from "../../src/shared/storage";
import {
  AI_STREAM_REQUEST_TYPE,
  type AiStreamRequest,
  type Chat,
  type ChatMessage,
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
  useChatSelection,
  useSidepanelTheme,
} from "./sidepanel-effects";
import { createSendMessagePlan } from "./send-message-plan";
import { interpolateSkillPackage } from "./skill-context";
import {
  ADD_MENU_VIEW,
  COMPOSER_MENU,
  type AddMenuView,
  type ComposerMenu,
} from "./sidepanel-menu-state";
import { SidepanelView } from "./sidepanel-view";
import { useComposerContext } from "./use-composer-context";
import { useChatDraft } from "./use-chat-drafts";
import { useConfiguredModels } from "./use-configured-models";
import { useElementSelector } from "./use-element-selector";
import { useMessageEdit } from "./use-message-edit";
import { useParallelChatStreams } from "./use-parallel-chat-streams";
import { usePromptUsageEstimate } from "./prompt-usage-preview";
import { useQueuedMessages } from "./use-queued-messages";
import { useUnreadCompletedChats } from "./use-unread-completed-chats";
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
  const [openMenu, setOpenMenu] = useState<ComposerMenu | null>(null);
  const [addMenuView, setAddMenuView] = useState<AddMenuView>("menu");
  const [showHistory, setShowHistory] = useState(false);
  const [chatSelectionRequestId, setChatSelectionRequestId] = useState(0);
  const [sentAttachmentPreviews, setSentAttachmentPreviews] = useState<
    Record<string, UploadedAttachment[]>
  >({});
  const sidepanelRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const initializedChatSelectionRef = useRef(false);
  const configuredModels = useConfiguredModels(
    providers,
    ignoreSyncedProvidersForBootstrap,
  );
  const modelCount = configuredModels.length;
  const currentChat = chats?.find((chat) => chat.id === activeChatId);
  const { input, setInput, clearInput } = useChatDraft(activeChatId);
  const {
    unreadCompletedChats,
    setUnreadCompletedChats,
    clearUnreadCompletedChat,
  } = useUnreadCompletedChats(activeChatId);
  const activeAgent = resolveAgent(agents, preferences?.selectedAgentId);
  const t = getMessages(language);
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
    streaming,
    currentChatStreaming,
    beginStream,
    startStream,
    abortChatStream,
    stopCurrentStream,
    postQueuedMessage,
    deleteQueuedStreamMessage,
    setQueuedMessageRemover,
  } = useParallelChatStreams({
    activeChatId,
    currentChat,
    chats,
    preferences,
    language,
    uploadedAttachments,
    agent: activeAgent,
    setChats,
    setUnreadCompletedChats,
  });
  const aiWorking = currentChatStreaming;
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
    agent: activeAgent,
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
    onRemoveMessage: (id) =>
      currentChat && deleteQueuedStreamMessage(currentChat.id, id),
  });

  useEffect(() => {
    setQueuedMessageRemover((id, chatId) => removeQueuedMessage(id, chatId));
  }, [removeQueuedMessage, setQueuedMessageRemover]);

  useEffect(() => void (aiWorking && setOpenMenu(null)), [aiWorking]);

  useBuiltinSkills(skills, setSkills);
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
    activeChatId,
    chatSelectionRequestId,
  );

  function closeChat(chatId: string) {
    abortChatStream(chatId);
    closeChatAction({
      chatId,
      activeChatId,
      setChats,
      setActiveChatId,
    });
    clearUnreadCompletedChat(chatId);
  }

  function selectChat(chatId: string) {
    selectChatAction({ chatId, setChats, setActiveChatId });
    setChatSelectionRequestId((value) => value + 1);
  }
  async function send(
    content = input,
    resendAttachments?: UploadedAttachment[],
    options: { queued?: boolean; resendMessage?: ChatMessage } = {},
  ) {
    const text = interpolateSkillVariables(content.trim());
    if ((!text && !uploadedAttachments.length) || currentChatStreaming) {
      if (currentChatStreaming && text && !options.resendMessage) {
        enqueueQueuedMessage(content);
        if (content === input) clearInput();
      }
      return;
    }
    const availableSkills = activeAgent.capabilities.skillTools
      ? (skills || []).filter(isSkillEnabled)
      : [];
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
        agentCapabilities: activeAgent.capabilities,
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
        },
      },
    };
    beginStream(nextChat.id, assistantMessage.id);
    startStream(request, assistantMessage.id);
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
      activeAgent={activeAgent}
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
      onStop={stopCurrentStream}
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

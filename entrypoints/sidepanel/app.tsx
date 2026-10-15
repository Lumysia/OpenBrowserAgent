import { useEffect, useRef, useState } from "react";
import { resolveAgent } from "../../src/shared/agents";
import { availableSkills } from "../../src/shared/skill-catalog";
import { storage } from "../../src/shared/storage";
import type { PickedSkill, UploadedAttachment } from "../../src/shared/types";
import {
  MessagesProvider,
  useMessages,
  useUiLanguage,
} from "../../src/ui/messages";
import { useSkillCatalog } from "../../src/ui/useSkillCatalog";
import { useStoredState } from "../../src/ui/useStoredState";
import { useTheme } from "../../src/ui/theme";
import { useDocumentLanguage } from "../../src/ui/use-document-language";
import { useSyncPageState } from "../../src/ui/useSyncPageState";
import { useChatSelection } from "./chat-selection";
import { useAutoScroll, useActiveChatCleanup } from "./sidepanel-effects";
import {
  ADD_MENU_VIEW,
  type AddMenuView,
  type ComposerMenu,
} from "./sidepanel-menu-state";
import { SidepanelProviders } from "./sidepanel-providers";
import { SidepanelView } from "./sidepanel-view";
import { addSkill, toggleSkill } from "./skill-context";
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
import { useSendMessage } from "./use-send-message";
import { useSidePanelHandoff } from "./use-side-panel-handoff";
import { useChatAttachments } from "./use-chat-attachments";
import { useUnreadCompletedChats } from "./use-unread-completed-chats";
import { useUploadedAttachments } from "./use-uploaded-attachments";

// The UI language is read once here; everything below reads it with
// useMessages().
export function SidepanelApp() {
  const [language, , languageLoading] = useStoredState(storage.language);
  useDocumentLanguage(language);
  if (languageLoading) return null;
  return (
    <MessagesProvider language={language}>
      <SidepanelRoot />
    </MessagesProvider>
  );
}

function SidepanelRoot() {
  const t = useMessages();
  const language = useUiLanguage();
  const [providers, , providersLoading] = useStoredState(storage.provider);
  const [ignoreSyncedBootstrap] = useStoredState(
    storage.ignoreSyncedProvidersForBootstrap,
  );
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [agents] = useStoredState(storage.agents);
  const { entries: skillEntries } = useSkillCatalog();
  const skills = availableSkills(skillEntries || []);
  const [selectedSkills, setSelectedSkills] = useState<PickedSkill[]>([]);
  const chatState = useChats();
  const chats = chatState.summaries;
  // The composer owns a draft chat before history loads, so text typed early
  // and an early send keep one chat ID.
  const [selection, dispatchSelection] = useChatSelection(
    chats,
    t.words.newChat,
  );
  const { activeChatId, draftChat } = selection;
  const [openMenu, setOpenMenu] = useState<ComposerMenu | null>(null);
  const [addMenuView, setAddMenuView] = useState<AddMenuView>("menu");
  const [sentAttachmentPreviews, setSentAttachmentPreviews] = useState<
    Record<string, UploadedAttachment[]>
  >({});
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const configuredModels = useModels(providers, ignoreSyncedBootstrap);
  const { currentChat, currentChatStatus, retryCurrentChat } = useCurrentChat({
    chats: chatState,
    activeChatId,
    draftChat,
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
  const { selectElement } = useElementSelector();
  const consent = useProviderConsent(providers, preferences, activeAgent);
  const attachments = useUploadedAttachments();
  const { uploadedAttachments, pendingAttachments } = attachments;
  const streams = useParallelChatStreams({
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
  const streaming = streams.currentChatStreaming;
  useRetainedChats(chatState, activeChatId, streams.streamingChatIds);
  const pageContext = useComposerContext();
  const {
    attachedTabs,
    selectedElements,
    selectedTexts,
    setAttachedTabs,
    setSelectedElements,
    setSelectedTexts,
  } = pageContext;
  const messageEdit = useMessageEdit({
    currentChat,
    streaming,
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
    stageUploadedAttachments: attachments.stageUploadedAttachments,
  });
  const queue = useQueuedMessages({
    chatId: currentChat?.id,
    streaming,
    sendQueued: (content) => send(content, undefined, { queued: true }),
    onEditContent: setInput,
    onQueueMessage: (message) =>
      currentChat &&
      streams.postQueuedMessage(currentChat.id, message.id, message.content),
    onRemoveMessage: (id, chatId) =>
      streams.deleteQueuedStreamMessage(chatId, id),
  });
  const { removeQueuedMessage } = queue;
  const { setQueuedMessageRemover } = streams;

  useEffect(() => {
    setQueuedMessageRemover((id, chatId) => removeQueuedMessage(id, chatId));
  }, [removeQueuedMessage, setQueuedMessageRemover]);

  const { storeSentAttachments } = useChatAttachments({
    currentChat,
    sentAttachmentPreviews,
    setSentAttachmentPreviews,
  });

  useEffect(() => void (streaming && setOpenMenu(null)), [streaming]);

  useTheme(document.documentElement, preferences ?? {});
  useSyncPageState();

  const { createChat, closeChat, selectChat, importChat, forkMessage } =
    useChatActions({
      chats: chatState,
      dispatchSelection,
      abortClosedChatStreams: streams.abortClosedChatStreams,
      clearUnreadCompletedChat,
    });

  const send = useSendMessage({
    chats: chatState,
    activeChatId,
    currentChat,
    currentChatStatus,
    createChat,
    providers,
    preferences,
    agent: activeAgent,
    confirmConsent: consent.confirmSend,
    input,
    clearInput,
    queueMessage: queue.queueMessage,
    skills,
    selectedSkills,
    setSelectedSkills,
    attachedTabs,
    selectedElements,
    selectedTexts,
    clearComposerContextAfterSend: pageContext.clearComposerContextAfterSend,
    uploadedAttachments,
    pendingAttachments,
    clearPendingAttachments: attachments.clearPendingAttachments,
    storeSentAttachments,
    editingMessage: messageEdit.editingMessage,
    setEditingMessage: messageEdit.setEditingMessage,
    streaming,
    beginStream: streams.beginStream,
    startStream: streams.startStream,
  });

  useSidePanelHandoff({
    ready: !!chats,
    importChat,
    createChat,
    attachTab: pageContext.attachTab,
    attachSelectedText: pageContext.attachSelectedText,
    currentChatId: currentChat?.id,
    canSend: currentChatStatus === "ready" && !streaming,
    send: ({ content, ...request }) => send(content, undefined, { request }),
    composerRef,
  });

  useActiveChatCleanup(activeChatId, () => {
    attachments.clearUploadedAttachments();
    messageEdit.setEditingMessage(null);
    setSentAttachmentPreviews({});
    pageContext.clearComposerContext();
    setSelectedSkills([]);
    setOpenMenu(null);
  });

  useAutoScroll(
    messagesRef,
    currentChat?.messages,
    preferences?.autoScroll,
    streaming,
    activeChatId,
    selection.openCount,
  );

  if (providersLoading) return null;

  return (
    <SidepanelProviders
      chat={{
        chats: chats || [],
        activeChatId,
        currentChat,
        currentChatStatus,
        agent: activeAgent,
        streaming,
        activeAssistantMessageId: streams.currentAssistantMessageId,
        stoppedRuns: streams.stoppedRuns,
        unreadCompletedChatIds: unreadCompletedChats,
        sentAttachmentPreviews,
        activeAttachments: uploadedAttachments,
        editingMessageId: messageEdit.editingMessage?.messageId,
        setChats: chatState.setSummaries,
        loadChat: chatState.loadChat,
        retryChat: retryCurrentChat,
        createChat,
        importChat,
        closeChat,
        selectChat,
        editMessage: messageEdit.editMessage,
        cancelEditMessage: messageEdit.cancelEditMessage,
        resendMessage: (message, resent) =>
          send(message.content, resent, { resendMessage: message }),
        forkMessage: (message, partId) =>
          forkMessage(currentChat, message, partId),
        replaceAttachment: attachments.replaceUploadedAttachment,
        answerQuestion: (toolCallId, answers) =>
          currentChat &&
          streams.answerQuestion(currentChat.id, toolCallId, answers),
        continueChat: () =>
          send(t.sidepanel.runStop.continueMessage, undefined, {
            queued: true,
          }),
      }}
      composer={{
        input,
        setInput,
        composerRef,
        openMenu,
        setOpenMenu,
        addMenuView,
        setAddMenuView,
        preferences,
        setPreferences,
        configuredModels,
        agents: agents || [],
        skills,
        selectedSkills,
        toggleSkill: (skill) =>
          setSelectedSkills((items) => toggleSkill(items, skill)),
        removeSkill: (skillId) =>
          setSelectedSkills((items) =>
            items.filter((skill) => skill.id !== skillId),
          ),
        pickSkill: (skill) => {
          setSelectedSkills((items) => addSkill(items, skill));
          setInput("");
        },
        availableTabs: pageContext.availableTabs,
        attachedTabs,
        activeTabAttachable: pageContext.activeTabAttachable,
        showAllTabsPicker: async () => {
          await pageContext.showAllTabsPicker();
          setAddMenuView(ADD_MENU_VIEW.tabs);
        },
        toggleAttachedTab: pageContext.toggleAttachedTab,
        attachActiveTab: pageContext.attachActiveTab,
        removeAttachedTab: pageContext.removeAttachedTab,
        selectedElements,
        setSelectedElements,
        selectElement,
        selectedTexts,
        removeSelectedText: pageContext.removeSelectedText,
        pendingAttachments,
        attachmentNotice: attachments.attachmentNotice,
        attachFiles: attachments.attachFiles,
        removeAttachment: attachments.removeUploadedAttachment,
        queuedMessages: streaming ? queue.queuedMessages : [],
        deleteQueuedMessage: queue.deleteQueuedMessage,
        editQueuedMessage: queue.editQueuedMessage,
        consentPrompt: consent.prompt,
        send: () => void send(),
        stop: streams.stopCurrentStream,
      }}
    >
      <SidepanelView
        modelCount={configuredModels.length}
        messagesRef={messagesRef}
      />
    </SidepanelProviders>
  );
}

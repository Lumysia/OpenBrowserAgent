import { useRef } from "react";
import type {
  Agent,
  AttachmentTab,
  Chat,
  ChatMessage,
  PickedSkill,
  Preferences,
  ProviderState,
  SelectedElement,
  SelectedText,
  UploadedAttachment,
} from "../../src/shared/types";
import { useMessages, useUiLanguage } from "../../src/ui/messages";
import { requestChatTitle } from "./ai-requests";
import { celebrateSend } from "./holiday-touches";
import { chatModelLabel } from "./model-label";
import {
  createSendMessagePlan,
  messageInstruction,
  pickSendInputs,
  sendMessagesRequest,
  type SendRequest,
} from "./send-message-plan";
import { buildSidepanelContext } from "./sidepanel-context";
import { addSkill, messageToSend } from "./skill-context";
import type { useChatAttachments } from "./use-chat-attachments";
import type { useMessageEdit } from "./use-message-edit";
import type { useChats } from "./use-chats";
import type { CurrentChatStatus } from "./use-current-chat";
import type { useParallelChatStreams } from "./use-parallel-chat-streams";

type SendOptions = {
  queued?: boolean;
  resendMessage?: ChatMessage;
  // A context menu or smart bar request: its own tabs and instruction.
  request?: SendRequest;
};

type SendMessage = (
  content?: string,
  resendAttachments?: UploadedAttachment[],
  options?: SendOptions,
) => Promise<void>;

type Streams = ReturnType<typeof useParallelChatStreams>;
type MessageEdit = ReturnType<typeof useMessageEdit>;

// Sends the composer's message (or a queued message, a resend, a request):
// checks it can go, asks for provider consent, stores the chat with the new
// messages, clears the composer and starts the stream.
export function useSendMessage(state: {
  chats: ReturnType<typeof useChats>;
  activeChatId: string;
  currentChat: Chat | undefined;
  currentChatStatus: CurrentChatStatus;
  createChat: () => Chat;
  providers: ProviderState | undefined;
  preferences: Preferences | undefined;
  agent: Agent;
  confirmConsent: (newChat: boolean) => Promise<boolean>;
  input: string;
  clearInput: () => void;
  queueMessage: (content: string) => void;
  skills: PickedSkill[];
  selectedSkills: PickedSkill[];
  setSelectedSkills: (skills: PickedSkill[]) => void;
  attachedTabs: AttachmentTab[];
  selectedElements: SelectedElement[];
  selectedTexts: SelectedText[];
  clearComposerContextAfterSend: () => void;
  uploadedAttachments: UploadedAttachment[];
  pendingAttachments: UploadedAttachment[];
  clearPendingAttachments: () => void;
  storeSentAttachments: ReturnType<
    typeof useChatAttachments
  >["storeSentAttachments"];
  editingMessage: MessageEdit["editingMessage"];
  setEditingMessage: MessageEdit["setEditingMessage"];
  streaming: boolean;
  beginStream: Streams["beginStream"];
  startStream: Streams["startStream"];
}): SendMessage {
  const t = useMessages();
  const language = useUiLanguage();
  const inFlight = useRef<Set<string>>(new Set());

  return async function send(
    content = state.input,
    resendAttachments,
    options = {},
  ) {
    const { currentChat, streaming, uploadedAttachments } = state;
    const { request: sendRequest } = options;
    const { slash, text } = messageToSend(
      content,
      state.skills,
      sendRequest ? "request" : options.resendMessage ? "resend" : "typed",
    );
    const sendChatId = currentChat?.id || state.activeChatId || "new";
    if (
      state.currentChatStatus !== "ready" ||
      (!text &&
        !uploadedAttachments.length &&
        !slash &&
        !(state.selectedSkills.length && !options.queued)) ||
      streaming ||
      inFlight.current.has(sendChatId)
    ) {
      if (streaming && text && !options.resendMessage) {
        state.queueMessage(content);
        if (content === state.input) state.clearInput();
      }
      return;
    }
    // Asks first when a provider it uses lacks the user's permission.
    if (!(await state.confirmConsent(!currentChat?.messages.length))) return;
    inFlight.current.add(sendChatId);
    void celebrateSend(state.preferences).catch(console.warn);
    try {
      const chat = currentChat || state.createChat();
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
        editingMessage: state.editingMessage,
        resendMessage: options.resendMessage,
        attachedTabs: state.attachedTabs,
        selectedElements: state.selectedElements,
        selectedTexts: state.selectedTexts,
        selectedSkills: state.selectedSkills,
        resendAttachments,
        pendingAttachments: state.pendingAttachments,
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
          state.agent,
          state.providers,
          state.preferences,
        ),
        sentTabs,
        sentElements,
        sentTexts,
        sentAttachments,
        skills: slash ? addSkill(sentSkills, slash.skill) : sentSkills,
        instruction:
          sendRequest?.instruction ?? messageInstruction(options.resendMessage),
        skillCheck: sendRequest?.skillCheck,
      });
      state.storeSentAttachments({
        chatId: nextChat.id,
        messageId: userMessage.id,
        attachments: sentAttachments,
        keptMessageIds: activeEdit?.keptMessageIds,
      });
      state.beginStream(nextChat.id, assistantMessage.id);
      const initialSnapshotPersist = state.chats
        .storeChat(nextChat)
        .catch((error) =>
          console.warn("Failed to persist initial chat snapshot", error),
        );
      if (!options.queued && !options.resendMessage) {
        state.clearInput();
        state.clearComposerContextAfterSend();
        state.clearPendingAttachments();
        state.setSelectedSkills([]);
        state.setEditingMessage(null);
      }
      await initialSnapshotPersist;
      if (shouldGenerateTitle)
        requestChatTitle({
          chatId: nextChat.id,
          modelId: state.preferences?.selectedModelId,
          message: titleSource,
          setSummaries: state.chats.setSummaries,
        });
      const request = sendMessagesRequest({
        chat: nextChat,
        messageId: assistantMessage.id,
        messages: [...baseChat.messages, userMessage],
        preferences: state.preferences,
        agent: state.agent,
        language,
        uploadedAttachments: activeAttachments,
      });
      state.startStream(request, assistantMessage.id);
    } finally {
      inFlight.current.delete(sendChatId);
    }
  };
}

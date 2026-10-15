import {
  createContext,
  useContext,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  Agent,
  AttachmentTab,
  Chat,
  ChatMessage,
  ChatSummary,
  ModelConfig,
  PickedSkill,
  Preferences,
  QuestionToolAnswer,
  SelectedElement,
  SelectedText,
  UploadedAttachment,
} from "../../src/shared/types";
import type { StoppedRuns } from "./run-state";
import type { AddMenuView, ComposerMenu } from "./sidepanel-menu-state";
import type {
  FileHandler,
  MessageAttachmentHandler,
  ReplaceAttachmentHandler,
} from "./sidepanel-view-types";
import type { SummariesUpdater } from "./use-chats";
import type { CurrentChatStatus } from "./use-current-chat";
import type { QueuedMessage } from "./use-queued-messages";

// The chat list, the open chat and its run, and what can be done to them.
export type ChatState = {
  chats: ChatSummary[];
  activeChatId: string;
  currentChat?: Chat;
  currentChatStatus: CurrentChatStatus;
  agent: Agent;
  streaming: boolean;
  activeAssistantMessageId?: string;
  stoppedRuns: StoppedRuns;
  unreadCompletedChatIds: Record<string, true>;
  sentAttachmentPreviews: Record<string, UploadedAttachment[]>;
  // The files attached in the composer, offered to messages missing theirs.
  activeAttachments: UploadedAttachment[];
  editingMessageId?: string;
  setChats: SummariesUpdater;
  loadChat: (chatId: string) => Promise<Chat | undefined>;
  retryChat: () => void;
  createChat: () => void;
  importChat: (chat: Chat) => void;
  closeChat: (chatId: string) => void;
  selectChat: (chatId: string) => void;
  editMessage: MessageAttachmentHandler;
  cancelEditMessage: () => void;
  resendMessage: MessageAttachmentHandler;
  forkMessage: (message: ChatMessage, partId?: string) => void;
  replaceAttachment: ReplaceAttachmentHandler;
  answerQuestion: (toolCallId: string, answers: QuestionToolAnswer[]) => void;
  // Asks the model to go on after the chat's latest response.
  continueChat: () => void;
};

// What the composer shows and edits: the message, its context and files,
// the menus, and the model, effort and agent the next send uses.
export type ComposerState = {
  input: string;
  setInput: (value: string) => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  openMenu: ComposerMenu | null;
  setOpenMenu: (value: ComposerMenu | null) => void;
  addMenuView: AddMenuView;
  setAddMenuView: (value: AddMenuView) => void;
  preferences?: Preferences;
  setPreferences: (
    value: Preferences | ((previous: Preferences) => Preferences),
  ) => void;
  configuredModels: ModelConfig[];
  agents: Agent[];
  skills: PickedSkill[];
  selectedSkills: PickedSkill[];
  toggleSkill: (skill: PickedSkill) => void;
  removeSkill: (skillId: string) => void;
  // A skill picked from the "/" list, replacing the "/query" typed so far.
  pickSkill: (skill: PickedSkill) => void;
  availableTabs: AttachmentTab[];
  attachedTabs: AttachmentTab[];
  activeTabAttachable: boolean;
  showAllTabsPicker: () => void;
  toggleAttachedTab: (tab: AttachmentTab) => void;
  attachActiveTab: () => Promise<void>;
  removeAttachedTab: (tabId: number) => void;
  selectedElements: SelectedElement[];
  setSelectedElements: (value: SelectedElement[]) => void;
  selectElement: () => Promise<void>;
  selectedTexts: SelectedText[];
  removeSelectedText: (selection: SelectedText) => void;
  pendingAttachments: UploadedAttachment[];
  attachmentNotice: string;
  attachFiles: FileHandler;
  removeAttachment: (id: string) => void;
  queuedMessages: QueuedMessage[];
  deleteQueuedMessage: (id: string) => void;
  editQueuedMessage: (message: QueuedMessage) => void;
  // The question before a send, above the composer.
  consentPrompt?: ReactNode;
  send: () => void;
  stop: () => void;
};

const ChatContext = createContext<ChatState | null>(null);
const ComposerContext = createContext<ComposerState | null>(null);

export function SidepanelProviders({
  chat,
  composer,
  children,
}: {
  chat: ChatState;
  composer: ComposerState;
  children: ReactNode;
}) {
  return (
    <ChatContext.Provider value={chat}>
      <ComposerContext.Provider value={composer}>
        {children}
      </ComposerContext.Provider>
    </ChatContext.Provider>
  );
}

export function useChat() {
  const value = useContext(ChatContext);
  if (!value) throw new Error("ChatContext is missing");
  return value;
}

export function useComposer() {
  const value = useContext(ComposerContext);
  if (!value) throw new Error("ComposerContext is missing");
  return value;
}

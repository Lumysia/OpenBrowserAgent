import { toAttachmentMetadata } from "../../src/shared/attachments";
import type { Messages } from "../../src/shared/i18n";
import type {
  AttachmentTab,
  Chat,
  ChatMessage,
  ChatSource,
  PickedSkill,
  SelectedElement,
  SelectedText,
  SendMessagesBody,
  UploadedAttachment,
} from "../../src/shared/types";
import {
  AI_STREAM_REQUEST_TYPE,
  type Agent,
  type Preferences,
  type SendMessagesRequest,
} from "../../src/shared/types";
import {
  createResendMessageDraft,
  type EditMessageDraft,
} from "./edit-message";
import { selectedElementImageAttachments } from "./selected-element-attachment";
import { generateLocalTitle } from "./sidepanel-context";

// A request from the context menu or the smart bar: the tabs and selected
// text it is about, and how the agent should carry it out (see
// side-panel-requests).
export type SendRequest = {
  instruction: string;
  tabs: AttachmentTab[];
  selectedTexts?: SelectedText[];
};

// The instruction a request's message carries, kept for a resend.
export function messageInstruction(message: ChatMessage | undefined) {
  const instruction = message?.metadata?.instruction;
  return typeof instruction === "string" ? instruction : undefined;
}

export function createSendMessagePlan({
  chat,
  text,
  t,
  sentTabs,
  sentElements,
  sentTexts = [],
  sentAttachments,
  context,
  sources,
  assistantModel,
  skills,
  instruction,
}: {
  chat: Chat;
  text: string;
  t: Messages;
  sentTabs: AttachmentTab[];
  sentElements: SelectedElement[];
  sentTexts?: SelectedText[];
  sentAttachments: UploadedAttachment[];
  context: string;
  sources?: ChatSource[];
  assistantModel?: { provider: string; name: string };
  skills?: PickedSkill[];
  instruction?: string;
}) {
  const selectedSkills = skills?.filter(Boolean) || [];
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content:
      text ||
      (selectedSkills.length
        ? t.sidepanel.skillOnlyMessage
        : t.sidepanel.attachmentOnlyMessage),
    createdAt: Date.now(),
    metadata: {
      ...(context ? { context } : {}),
      ...(sources?.length ? { sources } : {}),
      ...(sentTabs.length ? { attachedTabs: sentTabs } : {}),
      ...(sentElements.length
        ? { selectedElements: sentElements.map(toSelectedElementMetadata) }
        : {}),
      ...(sentTexts.length ? { selectedTexts: sentTexts } : {}),
      ...(sentAttachments.length
        ? { uploadedAttachments: sentAttachments.map(toAttachmentMetadata) }
        : {}),
      ...(selectedSkills.length ? { skills: selectedSkills } : {}),
      ...(instruction ? { instruction } : {}),
    },
  };
  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    parts: [],
    createdAt: Date.now(),
    metadata: {
      ...(assistantModel ? { assistantModel } : {}),
      runMetrics: { startedAt: Date.now(), outputCharacters: 0 },
    },
  };
  const shouldGenerateTitle = chat.messages.length === 0;
  const titleSource =
    text || sentAttachments[0]?.name || selectedSkills[0]?.name || "";
  const nextChat = {
    ...chat,
    title: shouldGenerateTitle
      ? generateLocalTitle(titleSource, t)
      : chat.title,
    messages: [...chat.messages, userMessage, assistantMessage],
    updatedAt: Date.now(),
  };
  return {
    userMessage,
    assistantMessage,
    shouldGenerateTitle,
    titleSource,
    nextChat,
  };
}

function toSelectedElementMetadata(element: SelectedElement) {
  const { imageDataUrl, ...metadata } = element;
  return metadata;
}

// Queued messages carry no extras; an edit or resend reuses the extras of the
// message it replaces; a request brings its own tabs and nothing else; a
// fresh send takes the composer's current extras.
export function pickSendInputs({
  chat,
  queued,
  editingMessage,
  resendMessage,
  attachedTabs,
  selectedElements,
  selectedTexts = [],
  selectedSkills,
  resendAttachments,
  pendingAttachments,
  uploadedAttachments,
  request,
}: {
  chat: Chat;
  queued: boolean;
  editingMessage: EditMessageDraft | null;
  resendMessage?: ChatMessage;
  attachedTabs: AttachmentTab[];
  selectedElements: SelectedElement[];
  selectedTexts?: SelectedText[];
  selectedSkills: PickedSkill[];
  resendAttachments?: UploadedAttachment[];
  pendingAttachments: UploadedAttachment[];
  uploadedAttachments: UploadedAttachment[];
  request?: SendRequest;
}) {
  if (request)
    return {
      activeEdit: null,
      baseChat: chat,
      sentTabs: request.tabs,
      sentElements: [],
      sentTexts: request.selectedTexts || [],
      sentSkills: [],
      sentAttachments: [],
      activeAttachments: [],
    };
  const edit = queued
    ? null
    : editingMessage?.chatId === chat.id
      ? editingMessage
      : resendMessage
        ? createResendMessageDraft({
            chat,
            message: resendMessage,
            attachments: resendAttachments || [],
          })
        : null;
  const sentTabs = queued ? [] : edit ? edit.attachedTabs : attachedTabs;
  const sentElements = queued
    ? []
    : edit
      ? edit.selectedElements
      : selectedElements;
  const sentTexts = queued ? [] : edit ? edit.selectedTexts : selectedTexts;
  const sentSkills = queued ? [] : edit ? edit.skills : selectedSkills;
  const imageAttachments = selectedElementImageAttachments(sentElements);
  return {
    activeEdit: edit,
    // An edit or resend replaces the message and everything after it.
    baseChat: edit
      ? {
          ...chat,
          messages: edit.messagesBefore,
          sources: edit.sourcesBefore,
          updatedAt: Date.now(),
        }
      : chat,
    sentTabs,
    sentElements,
    sentTexts,
    sentSkills,
    sentAttachments: [
      ...(queued ? [] : resendAttachments || pendingAttachments),
      ...imageAttachments,
    ],
    activeAttachments: [
      ...(queued ? [] : edit ? edit.attachments : uploadedAttachments),
      ...imageAttachments,
    ],
  };
}

type SendChoices = {
  preferences?: Preferences;
  agent: Agent;
  language?: string;
  uploadedAttachments: UploadedAttachment[];
};

export function sendMessagesRequest({
  chat,
  messageId,
  messages,
  ...choices
}: SendChoices & {
  chat: Chat;
  messageId: string;
  messages: ChatMessage[];
}): SendMessagesRequest {
  return {
    type: AI_STREAM_REQUEST_TYPE.sendMessages,
    chatId: chat.id,
    messageId,
    messages,
    body: sendMessagesBody(chat, choices),
  };
}

// What a run of `chat` runs with: the agent, model, language and files.
export function sendMessagesBody(
  chat: Pick<Chat, "kind"> | undefined,
  { preferences, agent, language, uploadedAttachments }: SendChoices,
): SendMessagesBody {
  return {
    agentId: agent.id,
    modelId: preferences?.selectedModelId,
    language,
    uploadedAttachments,
    subAgent: chat?.kind === "subagent",
  };
}

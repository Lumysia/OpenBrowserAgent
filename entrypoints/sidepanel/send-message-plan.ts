import { toAttachmentMetadata } from "../../src/shared/attachments";
import type { Messages } from "../../src/shared/i18n";
import type {
  AttachmentTab,
  Chat,
  ChatMessage,
  ChatSource,
  PickedSkill,
  SelectedElement,
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

export function createSendMessagePlan({
  chat,
  text,
  t,
  sentTabs,
  sentElements,
  sentAttachments,
  context,
  sources,
  assistantModel,
  skills,
}: {
  chat: Chat;
  text: string;
  t: Messages;
  sentTabs: AttachmentTab[];
  sentElements: SelectedElement[];
  sentAttachments: UploadedAttachment[];
  context: string;
  sources?: ChatSource[];
  assistantModel?: { provider: string; name: string };
  skills?: PickedSkill[];
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
      ...(sentAttachments.length
        ? { uploadedAttachments: sentAttachments.map(toAttachmentMetadata) }
        : {}),
      ...(selectedSkills.length ? { skills: selectedSkills } : {}),
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
// message it replaces; a fresh send takes the composer's current extras.
export function pickSendInputs({
  chat,
  queued,
  editingMessage,
  resendMessage,
  attachedTabs,
  selectedElements,
  selectedSkills,
  resendAttachments,
  pendingAttachments,
  uploadedAttachments,
}: {
  chat: Chat;
  queued: boolean;
  editingMessage: EditMessageDraft | null;
  resendMessage?: ChatMessage;
  attachedTabs: AttachmentTab[];
  selectedElements: SelectedElement[];
  selectedSkills: PickedSkill[];
  resendAttachments?: UploadedAttachment[];
  pendingAttachments: UploadedAttachment[];
  uploadedAttachments: UploadedAttachment[];
}) {
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

export function sendMessagesRequest({
  chat,
  messageId,
  messages,
  preferences,
  agent,
  language,
  uploadedAttachments,
}: {
  chat: Chat;
  messageId: string;
  messages: ChatMessage[];
  preferences?: Preferences;
  agent: Agent;
  language?: string;
  uploadedAttachments: UploadedAttachment[];
}): SendMessagesRequest {
  return {
    type: AI_STREAM_REQUEST_TYPE.sendMessages,
    chatId: chat.id,
    messageId,
    messages,
    body: {
      agentId: agent.id,
      modelId: preferences?.selectedModelId,
      language,
      uploadedAttachments,
      subAgent: chat.kind === "subagent",
    },
  };
}

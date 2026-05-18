import { toAttachmentMetadata } from "../../src/shared/attachments";
import type { Messages } from "../../src/shared/i18n";
import type {
  AttachmentTab,
  Chat,
  ChatMessage,
  ChatSource,
  SelectedElement,
  Skill,
  UploadedAttachment,
} from "../../src/shared/types";
import { generateLocalTitle } from "./sidepanel-context";

export function createSendMessagePlan({
  chat,
  text,
  t,
  sentTabs,
  sentElement,
  sentAttachments,
  context,
  sources,
  assistantModel,
  skill,
  autoSelectedSkill,
}: {
  chat: Chat;
  text: string;
  t: Messages;
  sentTabs: AttachmentTab[];
  sentElement: SelectedElement | null;
  sentAttachments: UploadedAttachment[];
  context: string;
  sources?: ChatSource[];
  assistantModel?: { provider: string; name: string };
  skill?: Skill;
  autoSelectedSkill?: boolean;
}) {
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: text || t.sidepanel.attachmentOnlyMessage,
    createdAt: Date.now(),
    metadata: {
      ...(context ? { context } : {}),
      ...(sources?.length ? { sources } : {}),
      ...(sentTabs.length ? { attachedTabs: sentTabs } : {}),
      ...(sentElement
        ? { selectedElement: toSelectedElementMetadata(sentElement) }
        : {}),
      ...(sentAttachments.length
        ? { uploadedAttachments: sentAttachments.map(toAttachmentMetadata) }
        : {}),
      ...(skill ? { skill, autoSelectedSkill } : {}),
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
  const titleSource = text || sentAttachments[0]?.name || "";
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

import type { Messages } from "../../src/shared/i18n";
import type {
  AttachmentTab,
  Chat,
  ChatMessage,
  QuickAction,
  SelectedElement,
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
  quickAction,
}: {
  chat: Chat;
  text: string;
  t: Messages;
  sentTabs: AttachmentTab[];
  sentElement: SelectedElement | null;
  sentAttachments: UploadedAttachment[];
  context: string;
  quickAction?: QuickAction;
}) {
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: text || t.sidepanel.attachmentOnlyMessage,
    createdAt: Date.now(),
    metadata: {
      ...(context ? { context } : {}),
      ...(sentTabs.length ? { attachedTabs: sentTabs } : {}),
      ...(sentElement ? { selectedElement: sentElement } : {}),
      ...(quickAction ? { quickAction } : {}),
    },
  };
  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    parts: [],
    createdAt: Date.now(),
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

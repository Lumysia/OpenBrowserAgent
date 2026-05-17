import type {
  AttachmentTab,
  Chat,
  ChatMessage,
  SelectedElement,
  UploadedAttachment,
} from "../../src/shared/types";

export function createEditMessageDraft({
  chat,
  message,
  attachments,
}: {
  chat: Chat;
  message: ChatMessage;
  attachments: UploadedAttachment[];
}) {
  const messageIndex = chat.messages.findIndex(
    (candidate) => candidate.id === message.id,
  );
  if (messageIndex < 0) return null;
  const messagesBefore = chat.messages.slice(0, messageIndex);
  const keptMessageIds = new Set(messagesBefore.map((item) => item.id));
  return {
    chatId: chat.id,
    messageId: message.id,
    content: message.content,
    attachments,
    messagesBefore,
    attachedTabs: Array.isArray(message.metadata?.attachedTabs)
      ? (message.metadata.attachedTabs as AttachmentTab[])
      : [],
    selectedElement: (message.metadata?.selectedElement ||
      null) as SelectedElement | null,
    keptMessageIds,
  };
}

export type EditMessageDraft = NonNullable<
  ReturnType<typeof createEditMessageDraft>
> & {
  previousContent: string;
  previousAttachments: UploadedAttachment[];
  previousAttachedTabs: AttachmentTab[];
  previousSelectedElement: SelectedElement | null;
};

export function pruneSentAttachmentPreviews(
  previews: Record<string, UploadedAttachment[]>,
  keptMessageIds: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(previews).filter(([id]) => keptMessageIds.has(id)),
  );
}

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
    selectedElements: selectedElementsFromMetadata(message.metadata),
    keptMessageIds,
  };
}

export function createResendMessageDraft({
  chat,
  message,
  attachments,
}: {
  chat: Chat;
  message: ChatMessage;
  attachments: UploadedAttachment[];
}) {
  return createEditMessageDraft({ chat, message, attachments });
}

export type EditMessageDraft = NonNullable<
  ReturnType<typeof createEditMessageDraft>
> & {
  previousContent: string;
  previousAttachments: UploadedAttachment[];
  previousAttachedTabs: AttachmentTab[];
  previousSelectedElements: SelectedElement[];
};

function selectedElementsFromMetadata(
  metadata: Record<string, unknown> | undefined,
) {
  if (Array.isArray(metadata?.selectedElements))
    return metadata.selectedElements as SelectedElement[];
  return metadata?.selectedElement
    ? [metadata.selectedElement as SelectedElement]
    : [];
}

export function pruneSentAttachmentPreviews(
  previews: Record<string, UploadedAttachment[]>,
  keptMessageIds: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(previews).filter(([id]) => keptMessageIds.has(id)),
  );
}

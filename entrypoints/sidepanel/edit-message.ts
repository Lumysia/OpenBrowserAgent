import type {
  AttachmentTab,
  Chat,
  ChatMessage,
  ChatSource,
  SelectedElement,
  Skill,
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
    sourcesBefore: sourcesForMessages(chat.sources || [], messagesBefore),
    attachedTabs: Array.isArray(message.metadata?.attachedTabs)
      ? (message.metadata.attachedTabs as AttachmentTab[])
      : [],
    selectedElements: selectedElementsFromMetadata(message.metadata),
    skills: skillsFromMetadata(message.metadata),
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
  previousSkills: Skill[];
};

function skillsFromMetadata(metadata: Record<string, unknown> | undefined) {
  if (Array.isArray(metadata?.skills)) return metadata.skills as Skill[];
  return metadata?.skill ? [metadata.skill as Skill] : [];
}

function selectedElementsFromMetadata(
  metadata: Record<string, unknown> | undefined,
) {
  if (Array.isArray(metadata?.selectedElements))
    return metadata.selectedElements as SelectedElement[];
  return metadata?.selectedElement
    ? [metadata.selectedElement as SelectedElement]
    : [];
}

function sourcesForMessages(sources: ChatSource[], messages: ChatMessage[]) {
  if (!sources.length || !messages.length) return [];
  const ids = new Set<string>();
  for (const message of messages) {
    collectCitationIds(ids, message.content);
    if (Array.isArray(message.metadata?.sources))
      for (const source of message.metadata.sources as ChatSource[])
        if (source.id) ids.add(source.id);
    for (const part of message.parts || []) {
      collectCitationIds(ids, part.text);
      const output = part.output as Record<string, unknown> | undefined;
      if (!output || !Array.isArray(output._sources)) continue;
      for (const source of output._sources as ChatSource[])
        if (source.id) ids.add(source.id);
    }
  }
  return sources.filter((source) => ids.has(source.id));
}

function collectCitationIds(ids: Set<string>, text: string | undefined) {
  if (!text) return;
  for (const match of text.matchAll(/\[\[cite:([\w-]+)\]\]/g))
    ids.add(match[1]);
}

export function pruneSentAttachmentPreviews(
  previews: Record<string, UploadedAttachment[]>,
  keptMessageIds: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(previews).filter(([id]) => keptMessageIds.has(id)),
  );
}

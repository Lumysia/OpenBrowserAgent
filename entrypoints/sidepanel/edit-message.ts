import type {
  AttachmentTab,
  Chat,
  ChatMessage,
  ChatSource,
  PickedSkill,
  SelectedElement,
  SelectedText,
  UploadedAttachment,
} from "../../src/shared/types";
import { pickedSkillsFromMetadata } from "../../src/shared/skills";
import { selectedTextsFromMetadata } from "../../src/shared/selected-text";

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
    selectedTexts: selectedTextsFromMetadata(message.metadata),
    skills: pickedSkillsFromMetadata(message.metadata),
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
  previousSelectedTexts: SelectedText[];
  previousSkills: PickedSkill[];
};

function selectedElementsFromMetadata(
  metadata: Record<string, unknown> | undefined,
) {
  return Array.isArray(metadata?.selectedElements)
    ? (metadata.selectedElements as SelectedElement[])
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

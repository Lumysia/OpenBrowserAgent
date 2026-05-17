import { useState } from "react";
import type {
  AttachmentTab,
  Chat,
  ChatMessage,
  SelectedElement,
  UploadedAttachment,
} from "../../src/shared/types";
import { createEditMessageDraft, type EditMessageDraft } from "./edit-message";

export function useMessageEdit({
  currentChat,
  streaming,
  input,
  pendingAttachments,
  attachedTabs,
  selectedElement,
  setInput,
  setAttachedTabs,
  setSelectedElement,
  stageUploadedAttachments,
}: {
  currentChat?: Chat;
  streaming: boolean;
  input: string;
  pendingAttachments: UploadedAttachment[];
  attachedTabs: AttachmentTab[];
  selectedElement: SelectedElement | null;
  setInput: (value: string) => void;
  setAttachedTabs: (tabs: AttachmentTab[]) => void;
  setSelectedElement: (element: SelectedElement | null) => void;
  stageUploadedAttachments: (attachments: UploadedAttachment[]) => void;
}) {
  const [editingMessage, setEditingMessage] = useState<EditMessageDraft | null>(
    null,
  );

  function editMessage(
    message: ChatMessage,
    attachments: UploadedAttachment[],
  ) {
    if (!currentChat || streaming) return;
    const draft = createEditMessageDraft({
      chat: currentChat,
      message,
      attachments,
    });
    if (!draft) return;
    setInput(draft.content);
    setAttachedTabs(draft.attachedTabs);
    setSelectedElement(draft.selectedElement);
    stageUploadedAttachments(draft.attachments);
    setEditingMessage({
      ...draft,
      previousContent: input,
      previousAttachments: pendingAttachments,
      previousAttachedTabs: attachedTabs,
      previousSelectedElement: selectedElement,
    });
  }

  function cancelEditMessage() {
    if (!editingMessage) return;
    setInput(editingMessage.previousContent);
    setAttachedTabs(editingMessage.previousAttachedTabs);
    setSelectedElement(editingMessage.previousSelectedElement);
    stageUploadedAttachments(editingMessage.previousAttachments);
    setEditingMessage(null);
  }

  return { editingMessage, setEditingMessage, editMessage, cancelEditMessage };
}

import { useEffect, useState } from "react";
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
  selectedElements,
  setInput,
  setAttachedTabs,
  setSelectedElements,
  stageUploadedAttachments,
}: {
  currentChat?: Chat;
  streaming: boolean;
  input: string;
  pendingAttachments: UploadedAttachment[];
  attachedTabs: AttachmentTab[];
  selectedElements: SelectedElement[];
  setInput: (value: string) => void;
  setAttachedTabs: (tabs: AttachmentTab[]) => void;
  setSelectedElements: (elements: SelectedElement[]) => void;
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
    setSelectedElements(draft.selectedElements);
    stageUploadedAttachments(draft.attachments);
    setEditingMessage({
      ...draft,
      previousContent: input,
      previousAttachments: pendingAttachments,
      previousAttachedTabs: attachedTabs,
      previousSelectedElements: selectedElements,
    });
  }

  function cancelEditMessage() {
    if (!editingMessage) return;
    setInput(editingMessage.previousContent);
    setAttachedTabs(editingMessage.previousAttachedTabs);
    setSelectedElements(editingMessage.previousSelectedElements);
    stageUploadedAttachments(editingMessage.previousAttachments);
    setEditingMessage(null);
  }

  useEffect(() => {
    if (!editingMessage) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      cancelEditMessage();
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, [editingMessage]);

  return { editingMessage, setEditingMessage, editMessage, cancelEditMessage };
}

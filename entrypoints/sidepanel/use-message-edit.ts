import { useEffect, useState } from "react";
import type {
  AttachmentTab,
  Chat,
  ChatMessage,
  PickedSkill,
  SelectedElement,
  SelectedText,
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
  selectedTexts,
  selectedSkills,
  setInput,
  setAttachedTabs,
  setSelectedElements,
  setSelectedTexts,
  setSelectedSkills,
  stageUploadedAttachments,
}: {
  currentChat?: Chat;
  streaming: boolean;
  input: string;
  pendingAttachments: UploadedAttachment[];
  attachedTabs: AttachmentTab[];
  selectedElements: SelectedElement[];
  selectedTexts: SelectedText[];
  selectedSkills: PickedSkill[];
  setInput: (value: string) => void;
  setAttachedTabs: (tabs: AttachmentTab[]) => void;
  setSelectedElements: (elements: SelectedElement[]) => void;
  setSelectedTexts: (texts: SelectedText[]) => void;
  setSelectedSkills: (skills: PickedSkill[]) => void;
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
    setSelectedTexts(draft.selectedTexts);
    setSelectedSkills(draft.skills);
    stageUploadedAttachments(draft.attachments);
    setEditingMessage({
      ...draft,
      previousContent: input,
      previousAttachments: pendingAttachments,
      previousAttachedTabs: attachedTabs,
      previousSelectedElements: selectedElements,
      previousSelectedTexts: selectedTexts,
      previousSkills: selectedSkills,
    });
  }

  function cancelEditMessage() {
    if (!editingMessage) return;
    setInput(editingMessage.previousContent);
    setAttachedTabs(editingMessage.previousAttachedTabs);
    setSelectedElements(editingMessage.previousSelectedElements);
    setSelectedTexts(editingMessage.previousSelectedTexts);
    setSelectedSkills(editingMessage.previousSkills);
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

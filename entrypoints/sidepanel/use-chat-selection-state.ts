import { useState } from "react";
import type { Chat } from "../../src/shared/types";
import { createChatDraft } from "./chat-state-actions";

export function useChatSelectionState(newChatTitle: string) {
  // Composer ownership exists before asynchronous history loading. Initial
  // selection keeps this draft, so typed text and in-flight sends share one ID.
  const [initialDraft] = useState(() => createChatDraft(newChatTitle));
  const [draftChat, setDraftChat] = useState<Chat | undefined>(initialDraft);
  const [activeChatId, setActiveChatId] = useState<string | undefined>(
    initialDraft.id,
  );
  return { draftChat, setDraftChat, activeChatId, setActiveChatId };
}

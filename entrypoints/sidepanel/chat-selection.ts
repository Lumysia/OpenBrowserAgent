import { useEffect, useReducer } from "react";
import type { Chat, ChatSummary } from "../../src/shared/types";
import { createChatDraft } from "./chat-state-actions";

// Which chat the panel shows: a stored chat, or the composer's draft until
// its first message is stored.
export type ChatSelection = {
  activeChatId: string;
  draftChat?: Chat;
  // Counts the times the user opened a chat, so opening the chat already
  // shown still scrolls it to the end.
  openCount: number;
};

export type ChatSelectionAction =
  // A new draft chat.
  | { type: "create"; chat: Chat }
  // A chat the user picked, imported or forked. `request` marks a pick from
  // the history or a link (see openCount).
  | { type: "open"; chatId: string; request?: boolean }
  // The stored chat list changed. `draft` is the chat to show when the open
  // chat is gone.
  | { type: "listChanged"; chats: ChatSummary[]; draft: Chat };

export function chatSelectionReducer(
  state: ChatSelection,
  action: ChatSelectionAction,
): ChatSelection {
  if (action.type === "create")
    return { ...state, activeChatId: action.chat.id, draftChat: action.chat };
  if (action.type === "open")
    return {
      activeChatId: action.chatId,
      draftChat:
        state.draftChat?.id === action.chatId ? state.draftChat : undefined,
      openCount: state.openCount + (action.request ? 1 : 0),
    };
  const stored = (id: string | undefined) =>
    !!id && action.chats.some((chat) => chat.id === id);
  const draftId = state.draftChat?.id;
  if (state.activeChatId !== draftId && !stored(state.activeChatId))
    return {
      ...state,
      activeChatId: action.draft.id,
      draftChat: action.draft,
    };
  // The draft leaves once it is stored.
  return stored(draftId) ? { ...state, draftChat: undefined } : state;
}

export function initialChatSelection(title: string): ChatSelection {
  const draftChat = createChatDraft(title);
  return { activeChatId: draftChat.id, draftChat, openCount: 0 };
}

// The selection, kept valid as the stored chat list changes: the open chat
// closed elsewhere gives way to a new draft.
export function useChatSelection(
  chats: ChatSummary[] | undefined,
  newChatTitle: string,
) {
  const [selection, dispatch] = useReducer(
    chatSelectionReducer,
    newChatTitle,
    initialChatSelection,
  );
  useEffect(() => {
    if (!chats) return;
    dispatch({
      type: "listChanged",
      chats,
      draft: createChatDraft(newChatTitle),
    });
  }, [chats, newChatTitle]);
  return [selection, dispatch] as const;
}

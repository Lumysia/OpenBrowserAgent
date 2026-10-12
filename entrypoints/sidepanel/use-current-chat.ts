import { useEffect, useMemo, useRef } from "react";
import { joinChat } from "../../src/shared/chats";
import type { Chat } from "../../src/shared/types";
import { useChatListCleanup } from "./sidepanel-effects";
import { useChatEntry, type useChats } from "./use-chats";

export type CurrentChatStatus = "ready" | "loading" | "error" | "unavailable";

// The open chat: a stored chat whose content loads on opening, or the
// composer's draft (dropped once stored).
export function useCurrentChat({
  chats,
  activeChatId,
  draftChat,
  setDraftChat,
}: {
  chats: ReturnType<typeof useChats>;
  activeChatId: string | undefined;
  draftChat: Chat | undefined;
  setDraftChat: (chat: Chat | undefined) => void;
}) {
  const { summaries, store } = chats;
  const storedSummary = summaries?.find((chat) => chat.id === activeChatId);
  useChatListCleanup({
    chats: summaries,
    setChats: chats.setSummaries,
    activeChatId,
    draftChat,
    storedCurrentChat: storedSummary,
    setDraftChat,
  });
  const storedId = storedSummary?.id;
  const entry = useChatEntry(store, storedId);

  // Load on opening (again after an earlier failure) and when dropped.
  const openedId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const opened = openedId.current !== storedId;
    openedId.current = storedId;
    if (storedId && (!entry || (opened && entry.status === "error")))
      void store.load(storedId);
  }, [entry, storedId, store]);

  // A list change may come with newer content from the cloud.
  useEffect(() => {
    if (storedId) store.revalidate(storedId);
  }, [summaries, storedId, store]);

  const currentChat = useMemo(() => {
    if (!storedSummary)
      return draftChat?.id === activeChatId ? draftChat : undefined;
    return entry?.status === "ready"
      ? joinChat(storedSummary, entry.content)
      : undefined;
  }, [activeChatId, draftChat, entry, storedSummary]);

  const status: CurrentChatStatus = !storedSummary
    ? "ready"
    : entry?.status === "error"
      ? entry.unavailable
        ? "unavailable"
        : "error"
      : entry?.status === "ready"
        ? "ready"
        : "loading";

  return {
    storedSummary,
    currentChat,
    currentChatStatus: status,
    retryCurrentChat: () => storedId && void store.load(storedId),
  };
}

// Only the open chat and chats still streaming keep their content in memory.
export function useRetainedChats(
  chats: ReturnType<typeof useChats>,
  activeChatId: string | undefined,
  streamingChatIds: string[],
) {
  const { store } = chats;
  const retained = [activeChatId || "", ...streamingChatIds].join("\u001f");
  useEffect(() => {
    store.retain(new Set(retained.split("\u001f")));
  }, [retained, store]);
}

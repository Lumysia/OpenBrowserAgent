import { useEffect, useState } from "react";

export function useUnreadCompletedChats(activeChatId: string | undefined) {
  const [unreadCompletedChats, setUnreadCompletedChats] = useState<
    Record<string, true>
  >({});

  useEffect(() => {
    if (!activeChatId) return;
    setUnreadCompletedChats((items) => {
      if (!items[activeChatId]) return items;
      const next = { ...items };
      delete next[activeChatId];
      return next;
    });
  }, [activeChatId]);

  function clearUnreadCompletedChat(chatId: string) {
    setUnreadCompletedChats((items) => {
      if (!items[chatId]) return items;
      const next = { ...items };
      delete next[chatId];
      return next;
    });
  }

  return {
    unreadCompletedChats,
    setUnreadCompletedChats,
    clearUnreadCompletedChat,
  };
}

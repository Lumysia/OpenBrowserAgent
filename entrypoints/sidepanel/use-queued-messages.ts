import { useEffect, useRef, useState } from "react";

export type QueuedMessage = {
  id: string;
  content: string;
};

export function useQueuedMessages({
  chatId,
  streaming,
  sendQueued,
  onEditContent,
  onQueueMessage,
  onRemoveMessage,
}: {
  chatId?: string;
  streaming: boolean;
  sendQueued: (content: string) => Promise<void>;
  onEditContent: (content: string) => void;
  onQueueMessage?: (message: QueuedMessage) => void;
  onRemoveMessage?: (id: string, chatId: string) => void;
}) {
  const [queuedMessagesByChat, setQueuedMessagesByChat] = useState<
    Record<string, QueuedMessage[]>
  >({});
  const queueDispatchingRef = useRef(false);
  const queuedMessages = chatId ? queuedMessagesByChat[chatId] || [] : [];

  useEffect(() => {
    if (
      !chatId ||
      streaming ||
      !queuedMessages.length ||
      queueDispatchingRef.current
    )
      return;
    const next = queuedMessages[0];
    queueDispatchingRef.current = true;
    setQueuedMessagesByChat((items) => ({
      ...items,
      [chatId]: (items[chatId] || []).slice(1),
    }));
    sendQueued(next.content)
      .catch(console.warn)
      .finally(() => {
        queueDispatchingRef.current = false;
      });
  }, [chatId, queuedMessages.length, sendQueued, streaming]);

  function queueMessage(content: string) {
    if (!chatId) return undefined;
    const text = content.trim();
    if (!text) return undefined;
    const message = { id: crypto.randomUUID(), content: text };
    setQueuedMessagesByChat((items) => ({
      ...items,
      [chatId]: [...(items[chatId] || []), message],
    }));
    onQueueMessage?.(message);
    return message;
  }

  function deleteQueuedMessage(id: string, targetChatId = chatId) {
    if (!targetChatId) return;
    setQueuedMessagesByChat((items) => ({
      ...items,
      [targetChatId]: (items[targetChatId] || []).filter(
        (message) => message.id !== id,
      ),
    }));
    onRemoveMessage?.(id, targetChatId);
  }

  function editQueuedMessage(message: QueuedMessage) {
    if (!chatId) return;
    setQueuedMessagesByChat((items) => ({
      ...items,
      [chatId]: (items[chatId] || []).filter(
        (candidate) => candidate.id !== message.id,
      ),
    }));
    onRemoveMessage?.(message.id, chatId);
    onEditContent(message.content);
  }

  return {
    queuedMessages,
    queueMessage,
    deleteQueuedMessage,
    removeQueuedMessage: deleteQueuedMessage,
    editQueuedMessage,
  };
}

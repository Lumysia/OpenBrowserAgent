import { useEffect, useRef, useState } from "react";

export type QueuedMessage = {
  id: string;
  content: string;
};

export function useQueuedMessages({
  streaming,
  sendQueued,
  onEditContent,
  onQueueMessage,
  onRemoveMessage,
}: {
  streaming: boolean;
  sendQueued: (content: string) => Promise<void>;
  onEditContent: (content: string) => void;
  onQueueMessage?: (message: QueuedMessage) => void;
  onRemoveMessage?: (id: string) => void;
}) {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const queueDispatchingRef = useRef(false);

  useEffect(() => {
    if (streaming || !queuedMessages.length || queueDispatchingRef.current)
      return;
    const next = queuedMessages[0];
    queueDispatchingRef.current = true;
    setQueuedMessages((items) => items.slice(1));
    sendQueued(next.content)
      .catch(console.warn)
      .finally(() => {
        queueDispatchingRef.current = false;
      });
  }, [queuedMessages.length, sendQueued, streaming]);

  function queueMessage(content: string) {
    const text = content.trim();
    if (!text) return undefined;
    const message = { id: crypto.randomUUID(), content: text };
    setQueuedMessages((items) => [...items, message]);
    onQueueMessage?.(message);
    return message;
  }

  function deleteQueuedMessage(id: string) {
    setQueuedMessages((items) => items.filter((message) => message.id !== id));
    onRemoveMessage?.(id);
  }

  function editQueuedMessage(message: QueuedMessage) {
    setQueuedMessages((items) =>
      items.filter((candidate) => candidate.id !== message.id),
    );
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

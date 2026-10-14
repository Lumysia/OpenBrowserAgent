import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  readChatAttachment,
  writeChatAttachments,
} from "../../src/shared/chat-attachments";
import type { Chat, UploadedAttachment } from "../../src/shared/types";
import { pruneSentAttachmentPreviews } from "./edit-message";

// Previews of a chat's sent attachments that this page does not hold (sent
// from another context, or synced from another device), and storing the ones
// this page sends.
export function useChatAttachments({
  currentChat,
  sentAttachmentPreviews,
  setSentAttachmentPreviews,
}: {
  currentChat?: Chat;
  sentAttachmentPreviews: Record<string, UploadedAttachment[]>;
  setSentAttachmentPreviews: Dispatch<
    SetStateAction<Record<string, UploadedAttachment[]>>
  >;
}) {
  const requestedAttachmentIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentChat) return;
    const missingAttachments = currentChat.messages.flatMap((message) => {
      const metadataAttachments = Array.isArray(
        message.metadata?.uploadedAttachments,
      )
        ? (message.metadata.uploadedAttachments as UploadedAttachment[])
        : [];
      return metadataAttachments
        .filter(
          (attachment) =>
            attachment.id &&
            !attachment.dataUrl &&
            !attachment.text &&
            !sentAttachmentPreviews[message.id]?.some(
              (item) => item.id === attachment.id,
            ) &&
            !requestedAttachmentIdsRef.current.has(attachment.id),
        )
        .map((attachment) => ({ messageId: message.id, id: attachment.id }));
    });
    if (!missingAttachments.length) return;
    missingAttachments.forEach((attachment) =>
      requestedAttachmentIdsRef.current.add(attachment.id),
    );
    Promise.all(
      missingAttachments.map(async (attachment) => ({
        messageId: attachment.messageId,
        value: await readChatAttachment(attachment.id),
      })),
    )
      .then((attachments) => {
        const loaded = attachments.filter(
          (
            attachment,
          ): attachment is {
            messageId: string;
            value: UploadedAttachment;
          } => !!attachment.value,
        );
        if (!loaded.length) return;
        loaded.forEach((attachment) =>
          requestedAttachmentIdsRef.current.delete(attachment.value.id),
        );
        setSentAttachmentPreviews((items) => {
          const next = { ...items };
          for (const attachment of loaded) {
            const existing = next[attachment.messageId] || [];
            if (existing.some((item) => item.id === attachment.value.id))
              continue;
            next[attachment.messageId] = [...existing, attachment.value];
          }
          return next;
        });
      })
      .catch((error) => {
        missingAttachments.forEach((attachment) =>
          requestedAttachmentIdsRef.current.delete(attachment.id),
        );
        console.warn("Failed to load chat attachments", error);
      });
  }, [currentChat, sentAttachmentPreviews, setSentAttachmentPreviews]);

  // Shows a sent message's attachments, and drops the previews of messages
  // an edit removed (all but `keptMessageIds`).
  function storeSentAttachments({
    chatId,
    messageId,
    attachments,
    keptMessageIds,
  }: {
    chatId: string;
    messageId: string;
    attachments: UploadedAttachment[];
    keptMessageIds?: Set<string>;
  }) {
    if (attachments.length || keptMessageIds)
      setSentAttachmentPreviews((items) => {
        const kept = keptMessageIds
          ? pruneSentAttachmentPreviews(items, keptMessageIds)
          : items;
        return attachments.length
          ? { ...kept, [messageId]: attachments }
          : kept;
      });
    writeChatAttachments({
      chatId,
      messageId,
      attachments,
    }).catch((error) =>
      console.warn("Failed to store chat attachments", error),
    );
  }

  return { storeSentAttachments };
}

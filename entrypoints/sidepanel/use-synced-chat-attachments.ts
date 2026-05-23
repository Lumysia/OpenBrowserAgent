import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  readSyncedChatAttachment,
  writeSyncedChatAttachments,
} from "../../src/shared/sync-chat-attachments";
import {
  SYNC_DATA_SETTING_KEYS,
  type SyncDataSettings,
} from "../../src/shared/sync-data-settings";
import type { Chat, UploadedAttachment } from "../../src/shared/types";

export function useSyncedChatAttachments({
  currentChat,
  syncDataSettings,
  sentAttachmentPreviews,
  setSentAttachmentPreviews,
}: {
  currentChat?: Chat;
  syncDataSettings?: SyncDataSettings;
  sentAttachmentPreviews: Record<string, UploadedAttachment[]>;
  setSentAttachmentPreviews: Dispatch<
    SetStateAction<Record<string, UploadedAttachment[]>>
  >;
}) {
  const requestedAttachmentIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (
      !currentChat ||
      !syncDataSettings?.[SYNC_DATA_SETTING_KEYS.chatAttachments]
    )
      return;
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
        value: await readSyncedChatAttachment(syncDataSettings, attachment.id),
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
        console.warn("Failed to load synced chat attachments", error);
      });
  }, [
    currentChat,
    syncDataSettings,
    sentAttachmentPreviews,
    setSentAttachmentPreviews,
  ]);

  function syncSentAttachments({
    chatId,
    messageId,
    attachments,
  }: {
    chatId: string;
    messageId: string;
    attachments: UploadedAttachment[];
  }) {
    writeSyncedChatAttachments({
      syncDataSettings,
      chatId,
      messageId,
      attachments,
    }).catch((error) =>
      console.warn("Failed to queue synced chat attachments", error),
    );
  }

  return { syncSentAttachments };
}

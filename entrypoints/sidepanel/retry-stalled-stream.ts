import {
  AI_STREAM_REQUEST_TYPE,
  type Chat,
  type ChatMessage,
  type SendMessagesBody,
  type SendMessagesRequest,
} from "../../src/shared/types";
import { STALLED_STREAM_RETRY } from "../../src/shared/model-notes";
import type { ActiveStream } from "./sidepanel-menu-state";

// Sends a stalled run again with the same agent, model and attachments.
export function retryStalledStream({
  active,
  chat,
  body,
  appendToAssistant,
  startStream,
}: {
  active: ActiveStream;
  chat: Chat | undefined;
  body: SendMessagesBody;
  appendToAssistant: (
    chatId: string,
    messageId: string,
    content: string,
  ) => void;
  startStream: (request: SendMessagesRequest, targetMessageId: string) => void;
}) {
  const assistantIndex = chat?.messages.findIndex(
    (message) => message.id === active.assistantMessageId,
  );
  if (!chat || assistantIndex === undefined || assistantIndex < 0) return;

  active.retryCount += 1;
  const retryInstruction: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    // The background marks it as an internal instruction.
    content: STALLED_STREAM_RETRY,
    createdAt: Date.now(),
    metadata: { internalRetry: true },
  };
  if (chat.messages[assistantIndex]?.content.trim())
    appendToAssistant(active.chatId, active.assistantMessageId, "\n\n");
  startStream(
    {
      type: AI_STREAM_REQUEST_TYPE.sendMessages,
      chatId: chat.id,
      messageId: crypto.randomUUID(),
      // The stalled reply goes along, so its finished steps are not redone.
      messages: [
        ...chat.messages.slice(0, assistantIndex + 1),
        retryInstruction,
      ],
      body,
    },
    active.assistantMessageId,
  );
}

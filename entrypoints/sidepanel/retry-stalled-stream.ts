import { DEFAULT_MAX_TOOL_STEPS } from "../../src/shared/config";
import { AI_STREAM_REQUEST_TYPE } from "../../src/shared/types";
import type {
  Chat,
  ChatMessage,
  Agent,
  Preferences,
  SendMessagesRequest,
  UploadedAttachment,
} from "../../src/shared/types";
import type { ActiveStream } from "./sidepanel-menu-state";

export function retryStalledStream({
  active,
  chats,
  preferences,
  language,
  uploadedAttachments,
  agent,
  appendToAssistant,
  startStream,
}: {
  active: ActiveStream;
  chats: Chat[];
  preferences?: Preferences;
  language: string;
  uploadedAttachments: UploadedAttachment[];
  agent: Agent;
  appendToAssistant: (
    chatId: string,
    messageId: string,
    content: string,
  ) => void;
  startStream: (request: SendMessagesRequest, targetMessageId: string) => void;
}) {
  const chat = chats.find((candidate) => candidate.id === active.chatId);
  const assistantIndex = chat?.messages.findIndex(
    (message) => message.id === active.assistantMessageId,
  );
  if (!chat || assistantIndex === undefined || assistantIndex < 0) return;

  active.retryCount += 1;
  const retryInstruction: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content:
      "<internal_instruction>The previous response stream stalled. Continue from the last completed step, start a new paragraph, do not repeat completed work, and respond in the same language as the user's latest non-internal message.</internal_instruction>",
    createdAt: Date.now(),
    metadata: { internalRetry: true },
  };
  if (chat.messages[assistantIndex]?.content.trim())
    appendToAssistant(active.chatId, active.assistantMessageId, "\n\n");
  startStream(
    {
      type: AI_STREAM_REQUEST_TYPE.sendMessages,
      chatId: active.chatId,
      messageId: crypto.randomUUID(),
      messages: [...chat.messages.slice(0, assistantIndex), retryInstruction],
      body: {
        modelId: preferences?.selectedModelId,
        agentCapabilities: agent.capabilities,
        language,
        maxToolSteps: preferences?.maxToolSteps ?? DEFAULT_MAX_TOOL_STEPS,
        context: { uploadedAttachments, agent },
      },
    },
    active.assistantMessageId,
  );
}

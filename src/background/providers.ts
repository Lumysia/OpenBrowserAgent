import type {
  AgentWorkspace,
  ChatMessage,
  ChatMode,
  McpServerConfig,
  ProviderId,
  Skill,
  UploadedAttachment,
} from "../shared/types";
import { requestGemini } from "./gemini-provider";
import { requestOpenAIChatCompletions } from "./openai-chat-provider";
import { requestOpenAIResponses } from "./openai-responses-provider";
import type { ProviderTextResult } from "./provider-output";
import type { QueuedUserMessage } from "./provider-queued-messages";

export async function requestOpenAICompatible(
  model: {
    provider: ProviderId;
    apiKey: string;
    baseUrl: string;
    modelName: string;
  },
  system: string,
  messages: ChatMessage[],
  mode: ChatMode,
  maxToolSteps: number,
  signal: AbortSignal,
  port: chrome.runtime.Port,
  chatId?: string,
  messageId?: string,
  attachmentRetryNotice?: string,
  uploadedAttachments: UploadedAttachment[] = [],
  availableSkills: Skill[] = [],
  mcpServers: McpServerConfig[] = [],
  workspace?: AgentWorkspace,
  drainQueuedMessages: () => QueuedUserMessage[] = () => [],
): Promise<ProviderTextResult> {
  if (model.provider === "gemini")
    return requestGemini(
      model,
      system,
      messages,
      mode,
      maxToolSteps,
      signal,
      port,
      chatId,
      attachmentRetryNotice,
      uploadedAttachments,
      availableSkills,
      mcpServers,
      workspace,
      drainQueuedMessages,
    );
  if (model.provider === "openai-responses")
    return requestOpenAIResponses(
      model,
      system,
      messages,
      mode,
      maxToolSteps,
      signal,
      port,
      chatId,
      messageId,
      attachmentRetryNotice,
      uploadedAttachments,
      availableSkills,
      mcpServers,
      workspace,
      drainQueuedMessages,
    );
  return requestOpenAIChatCompletions(
    model,
    system,
    messages,
    mode,
    maxToolSteps,
    signal,
    port,
    chatId,
    messageId,
    attachmentRetryNotice,
    uploadedAttachments,
    availableSkills,
    mcpServers,
    workspace,
    drainQueuedMessages,
  );
}

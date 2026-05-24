import {
  type AgentCapabilities,
  type AgentWorkspace,
  type ChatMessage,
  type McpServerConfig,
  type ProviderId,
  type Skill,
  type UploadedAttachment,
} from "../shared/types";
import { MODEL_TEMPERATURE } from "../shared/config";
import { ollamaChatCompletionsUrl } from "../shared/provider-urls";
import { requestOpenAIChatCompletions } from "./openai-chat-provider";
import type { ProviderTextResult } from "./provider-output";
import type { QueuedUserMessage } from "./provider-queued-messages";

type OllamaModel = {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  contextLength?: number;
};

export async function requestOllama(
  model: OllamaModel,
  system: string,
  messages: ChatMessage[],
  capabilities: AgentCapabilities,
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
  return requestOpenAIChatCompletions(
    withOllamaV1BaseUrl(model),
    system,
    messages,
    capabilities,
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

export async function requestOllamaPlainText(
  model: OllamaModel,
  messages: Array<{ role: "system" | "user"; content: string }>,
) {
  const response = await fetch(ollamaChatCompletionsUrl(model.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: model.modelName,
      temperature: MODEL_TEMPERATURE,
      messages,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function withOllamaV1BaseUrl(model: OllamaModel): OllamaModel {
  return { ...model, baseUrl: `${model.baseUrl.replace(/\/$/, "")}/v1` };
}

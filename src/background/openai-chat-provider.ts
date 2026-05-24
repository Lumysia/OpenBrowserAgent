import { UNKNOWN_TOOL_NAME } from "../shared/browser-tools";
import { MODEL_TEMPERATURE } from "../shared/config";
import { openAIChatCompletionsUrl } from "../shared/provider-urls";
import { reasoningRequestParams } from "../shared/reasoning";
import { storage } from "../shared/storage";
import {
  type AgentWorkspace,
  type AgentCapabilities,
  type AiStreamResponse,
  type ChatMessage,
  type McpServerConfig,
  type ProviderId,
  type Skill,
  type TokenUsage,
  type UploadedAttachment,
} from "../shared/types";
import {
  createOpenAIRequestMessages,
  hasImageAttachments,
} from "./attachment-messages";
import { applyOpenAIContextBudget } from "./context-budget";
import { parseToolArgs, post, postTextStream } from "./message-helpers";
import { readOpenAIStream } from "./openai-stream";
import {
  addTokenUsage,
  getMessageSources,
  latestUserMessageText,
  type ProviderTextResult,
} from "./provider-output";
import { postContextBudget } from "./provider-metrics";
import {
  injectQueuedOpenAIMessages,
  type QueuedUserMessage,
} from "./provider-queued-messages";
import { createToolResolver } from "./provider-tools";
import { runProviderTool } from "./provider-tool-runner";

export async function requestOpenAIChatCompletions(
  model: {
    provider: ProviderId;
    apiKey: string;
    baseUrl: string;
    modelName: string;
  },
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
  const chatUrl = openAIChatCompletionsUrl(model.baseUrl);
  let usesAttachmentPayload = hasImageAttachments(uploadedAttachments);
  let requestMessages: Array<Record<string, unknown>> =
    createOpenAIRequestMessages(
      system,
      messages,
      usesAttachmentPayload,
      uploadedAttachments,
      availableSkills,
      workspace,
    );
  const preferences = await storage.preferences.get();
  const latestUserText = latestUserMessageText(messages);
  const toolResolver = createToolResolver({
    capabilities,
    uploadedAttachments,
    availableSkills,
    preferences,
    latestUserText,
    mcpServers,
    workspace,
  });
  const availableTools = toolResolver.availableTools;
  const useTools = maxToolSteps > 0 && availableTools().length > 0;
  let responseSources = getMessageSources(messages);
  let responseUsage: TokenUsage | undefined;
  const postMetric = (message: AiStreamResponse) => post(port, message);

  async function fetchChatCompletion(body: Record<string, unknown>) {
    const reasoningParams = reasoningRequestParams(
      model.provider,
      preferences.reasoningEffort,
    );
    const budgeted = applyOpenAIContextBudget(requestMessages, preferences);
    postContextBudget(postMetric, budgeted.report);
    const response = await fetch(chatUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({
        ...body,
        ...reasoningParams,
        messages: budgeted.items,
      }),
    });
    if (response.ok || !usesAttachmentPayload) return response;
    requestMessages = createOpenAIRequestMessages(
      system,
      messages,
      false,
      uploadedAttachments,
      availableSkills,
      workspace,
    );
    usesAttachmentPayload = false;
    if (attachmentRetryNotice)
      await postTextStream(
        port,
        attachmentRetryNotice,
        crypto.randomUUID(),
        signal,
        false,
      );
    const retryBudgeted = applyOpenAIContextBudget(
      requestMessages,
      preferences,
    );
    postContextBudget(postMetric, retryBudgeted.report);
    return fetch(chatUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({
        ...body,
        ...reasoningParams,
        messages: retryBudgeted.items,
      }),
    });
  }

  if (!useTools) {
    const response = await fetchChatCompletion({
      model: model.modelName,
      temperature: MODEL_TEMPERATURE,
      stream: true,
      stream_options: { include_usage: true },
    });
    if (!response.ok) throw new Error(await response.text());
    const streamResult = await readOpenAIStream(
      response,
      port,
      signal,
      messageId,
    );
    return { text: "", outputMode: "streaming", usage: streamResult.usage };
  }

  for (let step = 0; step < maxToolSteps; step++) {
    const response = await fetchChatCompletion({
      model: model.modelName,
      temperature: MODEL_TEMPERATURE,
      stream: true,
      stream_options: { include_usage: true },
      tools: availableTools(),
      tool_choice: "auto",
    });
    if (!response.ok) throw new Error(await response.text());
    const streamResult = await readOpenAIStream(
      response,
      port,
      signal,
      step === 0 ? messageId : undefined,
    );
    responseUsage = addTokenUsage(responseUsage, streamResult.usage);
    const toolCalls = streamResult.toolCalls;
    if (!toolCalls.length)
      return { text: "", outputMode: "streaming", usage: responseUsage };
    requestMessages.push({
      role: "assistant",
      content: streamResult.content || null,
      ...(streamResult.reasoning
        ? { reasoning_content: streamResult.reasoning }
        : {}),
      tool_calls: toolCalls,
    });
    for (const toolCall of toolCalls) {
      const toolName = String(toolCall.function?.name || UNKNOWN_TOOL_NAME);
      const toolCallId = String(toolCall.id || crypto.randomUUID());
      const input = parseToolArgs(toolCall.function?.arguments);
      const result = await runProviderTool({
        toolName,
        toolCallId,
        input,
        port,
        chatId,
        messageId,
        uploadedAttachments,
        availableSkills,
        preferences,
        capabilities,
        workspace,
        responseSources,
        loadedToolNames: toolResolver.loadedToolNames,
        availableTools: availableTools(),
      });
      responseSources = result.responseSources;
      requestMessages.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: JSON.stringify(result.modelOutput),
      });
      if (result.visionImage)
        requestMessages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: "The tool image is attached for visual inspection. Use vision to answer the user's image question.",
            },
            {
              type: "image_url",
              image_url: { url: result.visionImage.dataUrl },
            },
          ],
        });
    }
    injectQueuedOpenAIMessages(port, requestMessages, drainQueuedMessages);
  }

  requestMessages.push({
    role: "user",
    content:
      "<internal_instruction>Maximum browser tool steps reached. Do not call more tools. Summarize the findings and clearly state what is known, what remains uncertain, and the best next step for the user. Respond in the same language as the user's latest non-internal message.</internal_instruction>",
  });
  const fallbackResponse = await fetchChatCompletion({
    model: model.modelName,
    temperature: MODEL_TEMPERATURE,
    stream: true,
    stream_options: { include_usage: true },
  });
  if (!fallbackResponse.ok) throw new Error(await fallbackResponse.text());
  const fallbackResult = await readOpenAIStream(fallbackResponse, port, signal);
  return {
    text: "",
    outputMode: "streaming",
    usage: addTokenUsage(responseUsage, fallbackResult.usage),
  };
}

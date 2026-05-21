import { UNKNOWN_TOOL_NAME } from "../shared/browser-tools";
import { MODEL_TEMPERATURE } from "../shared/config";
import { reasoningRequestParams } from "../shared/reasoning";
import { storage } from "../shared/storage";
import {
  type AgentCapabilities,
  type AgentWorkspace,
  type AiStreamResponse,
  type ChatMessage,
  type McpServerConfig,
  type ProviderId,
  type Skill,
  type TokenUsage,
  type UploadedAttachment,
} from "../shared/types";
import {
  createOpenAIResponsesInput,
  hasImageAttachments,
} from "./attachment-messages";
import { applyOpenAIResponsesContextBudget } from "./context-budget";
import { parseToolArgs, post, postTextStream } from "./message-helpers";
import {
  readOpenAIResponsesStream,
  type OpenAIResponsesFunctionCall,
} from "./openai-responses-stream";
import {
  addTokenUsage,
  getMessageSources,
  latestUserMessageText,
  type ProviderTextResult,
} from "./provider-output";
import { postContextBudget } from "./provider-metrics";
import { injectQueuedOpenAIResponsesInput } from "./provider-queued-messages";
import type { QueuedUserMessage } from "./provider-queued-messages";
import { createToolResolver } from "./provider-tools";
import { runProviderTool } from "./provider-tool-runner";

export async function requestOpenAIResponses(
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
  const baseUrl = model.baseUrl.replace(/\/$/, "");
  const responsesUrl = `${baseUrl}/responses`;
  let usesAttachmentPayload = hasImageAttachments(uploadedAttachments);
  let input: Array<Record<string, unknown>> = createOpenAIResponsesInput(
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

  async function fetchResponse(body: Record<string, unknown>) {
    const budgeted = applyOpenAIResponsesContextBudget(input, preferences);
    postContextBudget(postMetric, budgeted.report);
    const response = await fetch(responsesUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({
        ...body,
        instructions: system,
        input: budgeted.items,
      }),
    });
    if (response.ok || !usesAttachmentPayload) return response;

    input = createOpenAIResponsesInput(
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
    const retryBudgeted = applyOpenAIResponsesContextBudget(input, preferences);
    postContextBudget(postMetric, retryBudgeted.report);
    return fetch(responsesUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({
        ...body,
        instructions: system,
        input: retryBudgeted.items,
      }),
    });
  }

  const baseBody = () => ({
    model: model.modelName,
    temperature: MODEL_TEMPERATURE,
    stream: true,
    ...responsesReasoningParams(model.provider, preferences.reasoningEffort),
  });

  if (!useTools) {
    const response = await fetchResponse(baseBody());
    if (!response.ok) throw new Error(await response.text());
    const streamResult = await readOpenAIResponsesStream(
      response,
      port,
      signal,
      messageId,
    );
    return { text: "", outputMode: "streaming", usage: streamResult.usage };
  }

  for (let step = 0; step < maxToolSteps; step++) {
    const response = await fetchResponse({
      ...baseBody(),
      tools: responsesTools(availableTools()),
      tool_choice: "auto",
    });
    if (!response.ok) throw new Error(await response.text());
    const streamResult = await readOpenAIResponsesStream(
      response,
      port,
      signal,
      step === 0 ? messageId : undefined,
    );
    responseUsage = addTokenUsage(responseUsage, streamResult.usage);
    const functionCalls = streamResult.functionCalls;
    if (!functionCalls.length)
      return { text: "", outputMode: "streaming", usage: responseUsage };

    input.push(...functionCalls.map(responsesFunctionCallInput));
    for (const functionCall of functionCalls) {
      const toolName = String(functionCall.name || UNKNOWN_TOOL_NAME);
      const toolCallId = String(functionCall.call_id || crypto.randomUUID());
      const toolInput = parseToolArgs(functionCall.arguments);
      const result = await runProviderTool({
        toolName,
        toolCallId,
        input: toolInput,
        port,
        chatId,
        messageId,
        uploadedAttachments,
        availableSkills,
        preferences,
        workspace,
        responseSources,
        loadedToolNames: toolResolver.loadedToolNames,
        availableTools: availableTools(),
      });
      responseSources = result.responseSources;
      input.push({
        type: "function_call_output",
        call_id: toolCallId,
        output: JSON.stringify(result.output),
      });
      if (result.visionImage)
        input.push({
          role: "user",
          content: [
            {
              type: "input_text",
              text: "The image fetched by readFileFromUrl is attached for visual inspection. Use vision to answer the user's image question.",
            },
            { type: "input_image", image_url: result.visionImage.dataUrl },
          ],
        });
    }
    injectQueuedOpenAIResponsesInput(port, input, drainQueuedMessages);
  }

  input.push({
    role: "user",
    content: [
      {
        type: "input_text",
        text: "<internal_instruction>Maximum browser tool steps reached. Do not call more tools. Summarize the findings and clearly state what is known, what remains uncertain, and the best next step for the user. Respond in the same language as the user's latest non-internal message.</internal_instruction>",
      },
    ],
  });
  const fallbackResponse = await fetchResponse(baseBody());
  if (!fallbackResponse.ok) throw new Error(await fallbackResponse.text());
  const fallbackResult = await readOpenAIResponsesStream(
    fallbackResponse,
    port,
    signal,
  );
  return {
    text: "",
    outputMode: "streaming",
    usage: addTokenUsage(responseUsage, fallbackResult.usage),
  };
}

function responsesTools(tools: Array<Record<string, unknown>>) {
  return tools.map((tool) => {
    const fn = tool.function as Record<string, unknown> | undefined;
    return {
      type: "function",
      name: String(fn?.name || ""),
      description: String(fn?.description || ""),
      parameters: fn?.parameters || { type: "object", properties: {} },
    };
  });
}

function responsesFunctionCallInput(call: OpenAIResponsesFunctionCall) {
  return {
    type: "function_call",
    id: call.id,
    call_id: call.call_id,
    name: call.name || UNKNOWN_TOOL_NAME,
    arguments: call.arguments || "{}",
  };
}

function responsesReasoningParams(
  provider: ProviderId,
  effort: Parameters<typeof reasoningRequestParams>[1],
) {
  const params = reasoningRequestParams(provider, effort);
  if (!params.reasoning_effort) return params;
  return { reasoning: { effort: params.reasoning_effort } };
}

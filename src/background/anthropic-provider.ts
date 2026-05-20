import { UNKNOWN_TOOL_NAME } from "../shared/browser-tools";
import { base64FromDataUrl } from "../shared/attachments";
import { storage } from "../shared/storage";
import {
  type AgentWorkspace,
  type AiStreamResponse,
  type ChatMessage,
  type ChatMode,
  type McpServerConfig,
  type ProviderId,
  type Skill,
  type TokenUsage,
  type UploadedAttachment,
} from "../shared/types";
import {
  createAnthropicMessages,
  hasImageAttachments,
} from "./attachment-messages";
import { applyAnthropicContextBudget } from "./anthropic-context-budget";
import { post, postTextStream } from "./message-helpers";
import { readAnthropicStream } from "./anthropic-stream";
import {
  addTokenUsage,
  getMessageSources,
  latestUserMessageText,
  type ProviderTextResult,
} from "./provider-output";
import { postContextBudget } from "./provider-metrics";
import { createToolResolver } from "./provider-tools";
import { runProviderTool } from "./provider-tool-runner";
import type { QueuedUserMessage } from "./provider-queued-messages";

const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MAX_TOKENS = 8192;

export async function requestAnthropic(
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
  const url = `${model.baseUrl.replace(/\/$/, "")}/messages`;
  let usesAttachmentPayload = hasImageAttachments(uploadedAttachments);
  let requestMessages: Array<Record<string, unknown>> = createAnthropicMessages(
    messages,
    usesAttachmentPayload,
    uploadedAttachments,
    availableSkills,
    workspace,
  );
  const preferences = await storage.preferences.get();
  const latestUserText = latestUserMessageText(messages);
  const toolResolver = createToolResolver({
    mode,
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

  async function fetchAnthropic(body: Record<string, unknown>) {
    const budgeted = applyAnthropicContextBudget(requestMessages, preferences);
    postContextBudget(postMetric, budgeted.report);
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": ANTHROPIC_VERSION,
        ...(model.apiKey ? { "x-api-key": model.apiKey } : {}),
      },
      body: JSON.stringify({
        ...body,
        model: model.modelName,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        system,
        messages: budgeted.items,
        stream: true,
      }),
    });
    if (response.ok || !usesAttachmentPayload) return response;
    requestMessages = createAnthropicMessages(
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
    const retryBudgeted = applyAnthropicContextBudget(
      requestMessages,
      preferences,
    );
    postContextBudget(postMetric, retryBudgeted.report);
    return fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": ANTHROPIC_VERSION,
        ...(model.apiKey ? { "x-api-key": model.apiKey } : {}),
      },
      body: JSON.stringify({
        ...body,
        model: model.modelName,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        system,
        messages: retryBudgeted.items,
        stream: true,
      }),
    });
  }

  if (!useTools) {
    const response = await fetchAnthropic({});
    if (!response.ok) throw new Error(await response.text());
    const streamResult = await readAnthropicStream(
      response,
      port,
      signal,
      messageId,
    );
    return { text: "", outputMode: "streaming", usage: streamResult.usage };
  }

  for (let step = 0; step < maxToolSteps; step++) {
    const response = await fetchAnthropic({
      tools: anthropicTools(availableTools()),
    });
    if (!response.ok) throw new Error(await response.text());
    const streamResult = await readAnthropicStream(
      response,
      port,
      signal,
      step === 0 ? messageId : undefined,
    );
    responseUsage = addTokenUsage(responseUsage, streamResult.usage);
    if (!streamResult.toolUses.length)
      return { text: "", outputMode: "streaming", usage: responseUsage };
    requestMessages.push({
      role: "assistant",
      content: [
        ...(streamResult.content
          ? [{ type: "text", text: streamResult.content }]
          : []),
        ...streamResult.toolUses.map((toolUse) => ({
          type: "tool_use",
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
        })),
      ],
    });
    const toolResults = [];
    for (const toolUse of streamResult.toolUses) {
      const toolName = String(toolUse.name || UNKNOWN_TOOL_NAME);
      const toolCallId = String(toolUse.id || crypto.randomUUID());
      const result = await runProviderTool({
        toolName,
        toolCallId,
        input: toolUse.input || {},
        port,
        chatId,
        messageId,
        uploadedAttachments,
        availableSkills,
        preferences,
        workspace,
        responseSources,
        loadedToolNames: toolResolver.loadedToolNames,
      });
      responseSources = result.responseSources;
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolCallId,
        content: JSON.stringify(result.output),
      });
      if (result.visionImage) {
        toolResults.push({
          type: "text",
          text: "The image fetched by readFileFromUrl is attached for visual inspection. Use vision to answer the user's image question.",
        });
        toolResults.push({
          type: "image",
          source: {
            type: "base64",
            media_type: result.visionImage.type || "image/png",
            data: base64FromDataUrl(result.visionImage.dataUrl),
          },
        });
      }
    }
    requestMessages.push({ role: "user", content: toolResults });
    injectQueuedAnthropicMessages(port, requestMessages, drainQueuedMessages);
  }

  requestMessages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: "<internal_instruction>Maximum browser tool steps reached. Do not call more tools. Summarize the findings and clearly state what is known, what remains uncertain, and the best next step for the user. Respond in the same language as the user's latest non-internal message.</internal_instruction>",
      },
    ],
  });
  const fallbackResponse = await fetchAnthropic({});
  if (!fallbackResponse.ok) throw new Error(await fallbackResponse.text());
  const fallbackResult = await readAnthropicStream(
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

function anthropicTools(tools: Array<Record<string, unknown>>) {
  return tools.map((tool) => {
    const fn = tool.function as Record<string, unknown> | undefined;
    return {
      name: String(fn?.name || ""),
      description: String(fn?.description || ""),
      input_schema: fn?.parameters || { type: "object", properties: {} },
    };
  });
}

function injectQueuedAnthropicMessages(
  port: chrome.runtime.Port,
  messages: Array<Record<string, unknown>>,
  drainQueuedMessages: () => QueuedUserMessage[],
) {
  const queued = drainQueuedMessages();
  if (!queued.length) return;
  queued.forEach((message) =>
    messages.push({
      role: "user",
      content: [{ type: "text", text: message.content }],
    }),
  );
  const createdAt = Date.now();
  post(port, {
    type: "queuedMessages",
    messages: queued.map((message, index) => ({
      ...message,
      createdAt: createdAt + index,
    })),
    assistantMessageId: crypto.randomUUID(),
    createdAt: createdAt + queued.length,
  });
}

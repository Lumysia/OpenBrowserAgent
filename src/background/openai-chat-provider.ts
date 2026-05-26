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
import {
  buildCompactionPrompt,
  COMPACTION_SYSTEM_PROMPT,
  renderCompactionContext,
} from "./compaction-prompt";
import { applyOpenAIContextBudget } from "./context-budget";
import { parseToolArgs, post, postTextStream } from "./message-helpers";
import { OpenAIStreamError, readOpenAIStream } from "./openai-stream";
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
    contextLength?: number;
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
  let supportsStructuredContentPayload = true;
  let requestMessages: Array<Record<string, unknown>> =
    createOpenAIRequestMessages(
      system,
      messages,
      hasImageAttachments(uploadedAttachments),
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
  let compactionSummary: string | undefined;
  let compactionAttempted = false;
  let lastStructuredPartTypes: string[] = [];
  let structuredRetryNoticePosted = false;

  async function budgetRequestMessages() {
    requestMessages = repairOpenAIToolResultOrder(requestMessages);
    let budgeted = applyOpenAIContextBudget(
      requestMessages,
      preferences,
      compactionSummary,
      model.contextLength,
    );
    if (budgeted.report.prunedMessages && !compactionAttempted) {
      compactionAttempted = true;
      compactionSummary = await createOpenAICompactionSummary({
        chatUrl,
        apiKey: model.apiKey,
        modelName: model.modelName,
        signal,
        messages: requestMessages,
      });
      if (compactionSummary)
        budgeted = applyOpenAIContextBudget(
          requestMessages,
          preferences,
          compactionSummary,
          model.contextLength,
        );
    }
    postContextBudget(postMetric, budgeted.report);
    return budgeted;
  }

  function providerBody(
    body: Record<string, unknown>,
    reasoningParams: Record<string, unknown>,
    items: Array<Record<string, unknown>>,
  ) {
    return JSON.stringify({
      ...body,
      ...reasoningParams,
      messages: items,
    });
  }

  async function postChatCompletion(
    body: Record<string, unknown>,
    reasoningParams: Record<string, unknown>,
    items: Array<Record<string, unknown>>,
  ) {
    return fetch(chatUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: providerBody(body, reasoningParams, items),
    });
  }

  async function fetchChatCompletion(body: Record<string, unknown>) {
    const reasoningParams = reasoningRequestParams(
      model.provider,
      preferences.reasoningEffort,
    );
    const budgeted = await budgetRequestMessages();
    const response = await postChatCompletion(
      body,
      reasoningParams,
      budgeted.items,
    );
    const structuredPartTypes = openAIStructuredContentPartTypes(
      budgeted.items,
    );
    lastStructuredPartTypes = structuredPartTypes;
    const hasStructuredPayload = structuredPartTypes.length > 0;
    if (
      response.ok ||
      !supportsStructuredContentPayload ||
      !hasStructuredPayload
    )
      return response;
    const errorText = await response
      .clone()
      .text()
      .catch(() => "");
    if (
      !isUnsupportedOpenAIStructuredPayloadError(
        response.status,
        errorText,
        structuredPartTypes,
      )
    )
      return response;

    return retryTextOnlyChatCompletion(body, reasoningParams);
  }

  async function retryTextOnlyChatCompletion(
    body: Record<string, unknown>,
    reasoningParams = reasoningRequestParams(
      model.provider,
      preferences.reasoningEffort,
    ),
  ) {
    supportsStructuredContentPayload = false;
    requestMessages = createTextOnlyOpenAIMessages(requestMessages);
    requestMessages.push({
      role: "user",
      content:
        "<internal_instruction>The selected model rejected a non-text message payload, so this retry is text-only. Do not call tools that depend on non-text attachments, media bytes, screenshots, audio, video, files, or visual inspection again in this run. Use text-only browser inspection and file metadata when possible; if non-text content is required, tell the user to switch to a model/provider that supports that content type.</internal_instruction>",
    });
    if (attachmentRetryNotice && !structuredRetryNoticePosted) {
      structuredRetryNoticePosted = true;
      await postTextStream(
        port,
        `${attachmentRetryNotice}\n\n`,
        crypto.randomUUID(),
        signal,
      );
    }
    const retryBudgeted = await budgetRequestMessages();
    lastStructuredPartTypes = openAIStructuredContentPartTypes(
      retryBudgeted.items,
    );
    return postChatCompletion(body, reasoningParams, retryBudgeted.items);
  }

  async function fetchAndReadChatCompletion(
    body: Record<string, unknown>,
    preferredTextId?: string,
  ) {
    const response = await fetchChatCompletion(body);
    if (!response.ok) throw new Error(await response.text());
    try {
      return await readOpenAIStream(response, port, signal, preferredTextId);
    } catch (error) {
      if (!shouldRetryAfterOpenAIStreamError(error, lastStructuredPartTypes))
        throw error;
      const retryResponse = await retryTextOnlyChatCompletion(body);
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return readOpenAIStream(retryResponse, port, signal, preferredTextId);
    }
  }

  if (!useTools) {
    const streamResult = await fetchAndReadChatCompletion(
      {
        model: model.modelName,
        temperature: MODEL_TEMPERATURE,
        stream: true,
        stream_options: { include_usage: true },
      },
      messageId,
    );
    return { text: "", outputMode: "streaming", usage: streamResult.usage };
  }

  for (let step = 0; step < maxToolSteps; step++) {
    const streamResult = await fetchAndReadChatCompletion(
      {
        model: model.modelName,
        temperature: MODEL_TEMPERATURE,
        stream: true,
        stream_options: { include_usage: true },
        tools: availableTools(),
        tool_choice: "auto",
      },
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
    const deferredMediaMessages: Array<Record<string, unknown>> = [];
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
      if (result.visionImage && supportsStructuredContentPayload)
        deferredMediaMessages.push({
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
      else if (result.visionImage)
        deferredMediaMessages.push({
          role: "user",
          content:
            "A browser tool produced non-text media, but the selected model rejected non-text message payloads. Continue with the text-only tool result and explain that the media bytes are not available if the answer depends on them.",
        });
    }
    requestMessages.push(...deferredMediaMessages);
    injectQueuedOpenAIMessages(port, requestMessages, drainQueuedMessages);
  }

  requestMessages.push({
    role: "user",
    content:
      "<internal_instruction>Maximum browser tool steps reached. Do not call more tools. Summarize the findings and clearly state what is known, what remains uncertain, and the best next step for the user. Respond in the same language as the user's latest non-internal message.</internal_instruction>",
  });
  const fallbackResult = await fetchAndReadChatCompletion({
    model: model.modelName,
    temperature: MODEL_TEMPERATURE,
    stream: true,
    stream_options: { include_usage: true },
  });
  return {
    text: "",
    outputMode: "streaming",
    usage: addTokenUsage(responseUsage, fallbackResult.usage),
  };
}

function openAIStructuredContentPartTypes(
  messages: Array<Record<string, unknown>>,
) {
  return Array.from(
    new Set(
      messages.flatMap((message) =>
        structuredContentPartTypes(message.content),
      ),
    ),
  );
}

function structuredContentPartTypes(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const type = (part as Record<string, unknown>).type;
    return typeof type === "string" && type !== "text" ? [type] : [];
  });
}

function createTextOnlyOpenAIMessages(
  messages: Array<Record<string, unknown>>,
) {
  return messages.map((message) => ({
    ...message,
    content: textOnlyOpenAIContent(message.content),
  }));
}

function repairOpenAIToolResultOrder(messages: Array<Record<string, unknown>>) {
  const repaired: Array<Record<string, unknown>> = [];
  let index = 0;
  while (index < messages.length) {
    const message = messages[index];
    repaired.push(message);
    const toolCallIds = assistantToolCallIds(message);
    if (!toolCallIds.length) {
      index += 1;
      continue;
    }

    const remaining = new Set(toolCallIds);
    const toolMessages: Array<Record<string, unknown>> = [];
    const deferredMessages: Array<Record<string, unknown>> = [];
    let cursor = index + 1;
    for (; cursor < messages.length && remaining.size > 0; cursor += 1) {
      const candidate = messages[cursor];
      if (candidate.role === "assistant") break;
      const toolCallId = recordString(candidate, "tool_call_id");
      if (candidate.role === "tool" && remaining.has(toolCallId)) {
        toolMessages.push(candidate);
        remaining.delete(toolCallId);
        continue;
      }
      if (candidate.role === "tool") break;
      deferredMessages.push(candidate);
    }

    if (remaining.size > 0) {
      index += 1;
      continue;
    }
    repaired.push(...toolMessages, ...deferredMessages);
    index = cursor;
  }
  return repaired;
}

function assistantToolCallIds(message: Record<string, unknown>) {
  if (message.role !== "assistant" || !Array.isArray(message.tool_calls))
    return [];
  return message.tool_calls.flatMap((toolCall) => {
    const id = recordString(toolCall, "id");
    return id ? [id] : [];
  });
}

function recordString(value: unknown, key: string) {
  if (!value || typeof value !== "object") return "";
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw : "";
}

function textOnlyOpenAIContent(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  let removedNonTextParts = 0;
  const text = content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const record = part as Record<string, unknown>;
      if (record.type !== "text") {
        removedNonTextParts += 1;
        return [];
      }
      return typeof record.text === "string" ? [record.text] : [];
    })
    .join("\n\n")
    .trim();
  if (!removedNonTextParts) return text;
  if (text.toLowerCase().includes("tool image is attached"))
    return "A browser tool produced non-text media, but the selected model rejected non-text message payloads. Continue with the text-only tool result and explain that the media bytes are not available if the answer depends on them.";
  return text
    ? `${text}\n\n[Non-text content removed because the selected model rejected this message payload format.]`
    : "[Non-text content removed because the selected model rejected this message payload format.]";
}

function isUnsupportedOpenAIStructuredPayloadError(
  status: number,
  body: string,
  partTypes: string[],
) {
  if (status !== 400) return false;
  const lower = body.toLowerCase();
  const mentionsSentPartType = partTypes.some((type) =>
    lower.includes(type.toLowerCase()),
  );
  return (
    (mentionsSentPartType &&
      lower.includes("unknown variant") &&
      (lower.includes("expected `text`") || lower.includes("expected text"))) ||
    (lower.includes("expected `text`") && lower.includes("messages[")) ||
    (lower.includes("non-text") &&
      (lower.includes("unsupported") || lower.includes("not support"))) ||
    (lower.includes("multimodal") &&
      (lower.includes("unsupported") || lower.includes("not support"))) ||
    ((lower.includes("image") ||
      lower.includes("audio") ||
      lower.includes("video") ||
      lower.includes("file") ||
      lower.includes("attachment")) &&
      (lower.includes("unsupported") || lower.includes("not support")))
  );
}

function shouldRetryAfterOpenAIStreamError(
  error: unknown,
  partTypes: string[],
) {
  if (!(error instanceof OpenAIStreamError)) return false;
  if (error.contentStarted || !partTypes.length) return false;
  const payload = error.payload as { type?: unknown; message?: unknown };
  const message =
    typeof payload?.message === "string" ? payload.message : error.message;
  const type = typeof payload?.type === "string" ? payload.type : "";
  return (
    isUnsupportedOpenAIStructuredPayloadError(400, message, partTypes) ||
    (type === "upstream_error" && message.toLowerCase().includes("upstream"))
  );
}

async function createOpenAICompactionSummary(input: {
  chatUrl: string;
  apiKey?: string;
  modelName: string;
  signal: AbortSignal;
  messages: Array<Record<string, unknown>>;
}) {
  const context = renderCompactionContext(input.messages, 220_000);
  if (!context.length) return undefined;
  try {
    const response = await fetch(input.chatUrl, {
      method: "POST",
      signal: input.signal,
      headers: {
        "Content-Type": "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: input.modelName,
        temperature: 0.1,
        stream: false,
        messages: [
          { role: "system", content: COMPACTION_SYSTEM_PROMPT },
          { role: "user", content: buildCompactionPrompt({ context }) },
        ],
      }),
    });
    if (!response.ok) return undefined;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const summary = data.choices?.[0]?.message?.content?.trim();
    return summary || undefined;
  } catch {
    return undefined;
  }
}

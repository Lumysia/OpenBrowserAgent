import { UNKNOWN_TOOL_NAME } from "../shared/browser-tools";
import { storage } from "../shared/storage";
import { MODEL_TEMPERATURE } from "../shared/config";
import {
  CHAT_PART_STATE,
  toolPartType,
  type AiStreamResponse,
  type ChatMessage,
  type ChatMode,
  type ProviderId,
  type Skill,
  type TokenUsage,
  type UploadedAttachment,
} from "../shared/types";
import { isToolError } from "./tool-utils";
import {
  createGeminiContents,
  createOpenAIRequestMessages,
  hasImageAttachments,
} from "./attachment-messages";
import { parseToolArgs, post, postTextStream } from "./message-helpers";
import { readOpenAIStream } from "./openai-stream";
import {
  attachToolSources,
  addTokenUsage,
  base64FromDataUrl,
  extractVisionImage,
  geminiText,
  getMessageSources,
  latestUserMessageText,
  mergeOutputSources,
  normalizeGeminiUsage,
  type ProviderTextResult,
  sanitizeToolOutput,
} from "./provider-output";
import {
  createToolResolver,
  executeContextAwareTool,
  loadDeferredToolNames,
} from "./provider-tools";
import {
  applyGeminiContextBudget,
  applyOpenAIContextBudget,
} from "./context-budget";
import { postContextBudget } from "./provider-metrics";
import {
  injectQueuedGeminiMessages,
  injectQueuedOpenAIMessages,
  type QueuedUserMessage,
} from "./provider-queued-messages";

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
  messageId?: string,
  attachmentRetryNotice?: string,
  uploadedAttachments: UploadedAttachment[] = [],
  availableSkills: Skill[] = [],
  drainQueuedMessages: () => QueuedUserMessage[] = () => [],
): Promise<ProviderTextResult> {
  if (model.provider === "gemini") {
    return requestGemini(
      model,
      system,
      messages,
      mode,
      maxToolSteps,
      signal,
      port,
      attachmentRetryNotice,
      uploadedAttachments,
      availableSkills,
      drainQueuedMessages,
    );
  }
  const baseUrl = model.baseUrl.replace(/\/$/, "");
  const chatUrl =
    model.provider === "ollama"
      ? `${baseUrl}/v1/chat/completions`
      : `${baseUrl}/chat/completions`;
  let usesAttachmentPayload = hasImageAttachments(uploadedAttachments);
  let requestMessages: Array<Record<string, unknown>> =
    createOpenAIRequestMessages(
      system,
      messages,
      usesAttachmentPayload,
      uploadedAttachments,
      availableSkills,
    );
  const preferences = await storage.preferences.get();
  const latestUserText = latestUserMessageText(messages);
  const toolResolver = createToolResolver({
    mode,
    uploadedAttachments,
    availableSkills,
    preferences,
    latestUserText,
  });
  const availableTools = toolResolver.availableTools;
  const useTools = maxToolSteps > 0 && availableTools().length > 0;
  let responseSources = getMessageSources(messages);
  let responseUsage: TokenUsage | undefined;
  const postMetric = (message: AiStreamResponse) => post(port, message);
  async function fetchChatCompletion(body: Record<string, unknown>) {
    const budgeted = applyOpenAIContextBudget(requestMessages, preferences);
    postContextBudget(postMetric, budgeted.report);
    const response = await fetch(chatUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({ ...body, messages: budgeted.items }),
    });
    if (response.ok || !usesAttachmentPayload) return response;
    requestMessages = createOpenAIRequestMessages(
      system,
      messages,
      false,
      uploadedAttachments,
      availableSkills,
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
      body: JSON.stringify({ ...body, messages: retryBudgeted.items }),
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
      true,
    );
    responseUsage = addTokenUsage(responseUsage, streamResult.usage);
    const toolCalls = streamResult.toolCalls;
    if (!toolCalls.length)
      return { text: "", outputMode: "streaming", usage: responseUsage };
    requestMessages.push({
      role: "assistant",
      content: streamResult.content || null,
      tool_calls: toolCalls,
    });
    for (const toolCall of toolCalls) {
      const toolName = String(toolCall.function?.name || UNKNOWN_TOOL_NAME);
      const toolCallId = String(toolCall.id || crypto.randomUUID());
      const input = parseToolArgs(toolCall.function?.arguments);
      post(port, {
        type: "chunk",
        chunk: {
          type: toolPartType(toolName),
          toolCallId,
          toolName,
          state: CHAT_PART_STATE.inputAvailable,
          input,
        },
      });
      const rawOutput = await executeContextAwareTool({
        toolName,
        input,
        uploadedAttachments,
        availableSkills,
        cdpToolsEnabled: !!preferences.cdpToolsEnabled,
        dangerousCodeExecutionEnabled:
          !!preferences.dangerousCodeExecutionEnabled,
      });
      loadDeferredToolNames(rawOutput, toolResolver.loadedToolNames);
      const visionImage = extractVisionImage(rawOutput);
      const output = attachToolSources(
        toolName,
        input,
        sanitizeToolOutput(rawOutput),
        responseSources,
      );
      responseSources = mergeOutputSources(responseSources, output);
      const hasError = isToolError(output);
      post(port, {
        type: "chunk",
        chunk: {
          type: toolPartType(toolName),
          toolCallId,
          toolName,
          state: hasError
            ? CHAT_PART_STATE.outputError
            : CHAT_PART_STATE.outputAvailable,
          input,
          output,
        },
      });
      requestMessages.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: JSON.stringify(output),
      });
      if (visionImage)
        requestMessages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: "The image fetched by readFileFromUrl is attached for visual inspection. Use vision to answer the user's image question.",
            },
            { type: "image_url", image_url: { url: visionImage.dataUrl } },
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
async function requestGemini(
  model: { apiKey: string; modelName: string },
  system: string,
  messages: ChatMessage[],
  mode: ChatMode,
  maxToolSteps: number,
  signal: AbortSignal,
  port: chrome.runtime.Port,
  attachmentRetryNotice?: string,
  uploadedAttachments: UploadedAttachment[] = [],
  availableSkills: Skill[] = [],
  drainQueuedMessages: () => QueuedUserMessage[] = () => [],
): Promise<ProviderTextResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.modelName)}:generateContent?key=${encodeURIComponent(model.apiKey)}`;
  let contents: Array<Record<string, unknown>> = createGeminiContents(
    messages,
    true,
    uploadedAttachments,
    availableSkills,
  );
  let usesAttachmentPayload = hasImageAttachments(uploadedAttachments);

  async function fetchGemini(body: Record<string, unknown>) {
    const budgeted = applyGeminiContextBudget(contents, preferences);
    postContextBudget(postMetric, budgeted.report);
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, contents: budgeted.items }),
    });
    if (response.ok || !usesAttachmentPayload) return response;

    contents = createGeminiContents(
      messages,
      false,
      uploadedAttachments,
      availableSkills,
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
    const retryBudgeted = applyGeminiContextBudget(contents, preferences);
    postContextBudget(postMetric, retryBudgeted.report);
    return fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, contents: retryBudgeted.items }),
    });
  }

  const preferences = await storage.preferences.get();
  const latestUserText = latestUserMessageText(messages);
  const toolResolver = createToolResolver({
    mode,
    uploadedAttachments,
    availableSkills,
    preferences,
    latestUserText,
  });
  const availableTools = toolResolver.availableTools;
  const useTools = maxToolSteps > 0 && availableTools().length > 0;
  let responseSources = getMessageSources(messages);
  const postMetric = (message: AiStreamResponse) => post(port, message);

  if (!useTools) {
    const response = await fetchGemini({
      systemInstruction: { parts: [{ text: system }] },
      contents,
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return {
      text: geminiText(data),
      outputMode: "buffered",
      usage: normalizeGeminiUsage(data.usageMetadata),
    };
  }

  for (let step = 0; step < maxToolSteps; step++) {
    const response = await fetchGemini({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [
        {
          functionDeclarations: availableTools().map((item) => item.function),
        },
      ],
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts
      .map(
        (part: {
          functionCall?: { name?: string; args?: Record<string, unknown> };
        }) => part.functionCall,
      )
      .filter(Boolean);
    if (!functionCalls.length)
      return {
        text:
          parts.map((part: { text?: string }) => part.text || "").join("") ||
          "",
        outputMode: "buffered",
        usage: normalizeGeminiUsage(data.usageMetadata),
      };

    const textBeforeTools = parts
      .map((part: { text?: string }) => part.text || "")
      .join("");
    if (textBeforeTools)
      await postTextStream(
        port,
        textBeforeTools,
        crypto.randomUUID(),
        signal,
        false,
      );

    contents.push({ role: "model", parts });
    const responseParts = [];
    for (const functionCall of functionCalls) {
      const toolName = String(functionCall.name || UNKNOWN_TOOL_NAME);
      const toolCallId = crypto.randomUUID();
      const input = functionCall.args || {};
      post(port, {
        type: "chunk",
        chunk: {
          type: toolPartType(toolName),
          toolCallId,
          toolName,
          state: CHAT_PART_STATE.inputAvailable,
          input,
        },
      });
      const rawOutput = await executeContextAwareTool({
        toolName,
        input,
        uploadedAttachments,
        availableSkills,
        cdpToolsEnabled: !!preferences.cdpToolsEnabled,
        dangerousCodeExecutionEnabled:
          !!preferences.dangerousCodeExecutionEnabled,
      });
      loadDeferredToolNames(rawOutput, toolResolver.loadedToolNames);
      const visionImage = extractVisionImage(rawOutput);
      const output = attachToolSources(
        toolName,
        input,
        sanitizeToolOutput(rawOutput),
        responseSources,
      );
      responseSources = mergeOutputSources(responseSources, output);
      const hasError = isToolError(output);
      post(port, {
        type: "chunk",
        chunk: {
          type: toolPartType(toolName),
          toolCallId,
          toolName,
          state: hasError
            ? CHAT_PART_STATE.outputError
            : CHAT_PART_STATE.outputAvailable,
          input,
          output,
        },
      });
      responseParts.push({
        functionResponse: { name: toolName, response: output },
      });
      if (visionImage) {
        responseParts.push({
          text: "The image fetched by readFileFromUrl is attached for visual inspection. Use vision to answer the user's image question.",
        });
        responseParts.push({
          inline_data: {
            mime_type: visionImage.type || "image/png",
            data: base64FromDataUrl(visionImage.dataUrl),
          },
        });
      }
    }
    contents.push({ role: "user", parts: responseParts });
    injectQueuedGeminiMessages(port, contents, drainQueuedMessages);
  }

  contents.push({
    role: "user",
    parts: [
      {
        text: "<internal_instruction>Maximum browser tool steps reached. Do not call more tools. Summarize the findings and clearly state what is known, what remains uncertain, and the best next step for the user. Respond in the same language as the user's latest non-internal message.</internal_instruction>",
      },
    ],
  });
  const response = await fetchGemini({
    systemInstruction: { parts: [{ text: system }] },
    contents,
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return {
    text: geminiText(data),
    outputMode: "buffered",
    usage: normalizeGeminiUsage(data.usageMetadata),
  };
}

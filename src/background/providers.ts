import { BROWSER_TOOL_NAME, UNKNOWN_TOOL_NAME } from "../shared/browser-tools";
import { storage } from "../shared/storage";
import { MODEL_TEMPERATURE, STREAM_CHUNK_DELAY_MS } from "../shared/config";
import {
  assignChatSources,
  extractSourcesFromTool,
} from "../shared/chat-sources";
import {
  CHAT_PART_STATE,
  toolPartType,
  type AiStreamResponse,
  type ChatMessage,
  type ChatMode,
  type ChatSource,
  type ProviderId,
  type Skill,
  type UploadedAttachment,
} from "../shared/types";
import { isToolError } from "./tool-utils";
import {
  createGeminiContents,
  createOpenAIRequestMessages,
  hasImageAttachments,
} from "./attachment-messages";
import { chunkText, parseToolArgs, postText } from "./message-helpers";
import { readOpenAIStream } from "./openai-stream";
import { executeContextAwareTool, toolsForMode } from "./provider-tools";

function post(port: chrome.runtime.Port, message: AiStreamResponse) {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post ai-stream message", error);
  }
}

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
) {
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
  const availableTools = toolsForMode(
    mode,
    uploadedAttachments.length > 0,
    availableSkills.length > 0,
    !!(await storage.preferences.get()).imageGenerationEnabled,
  );
  const useTools = maxToolSteps > 0 && availableTools.length > 0;
  let responseSources = getMessageSources(messages);

  async function fetchChatCompletion(body: Record<string, unknown>) {
    const response = await fetch(chatUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
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
      postText(port, attachmentRetryNotice, crypto.randomUUID(), signal, false);
    return fetch(chatUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({ ...body, messages: requestMessages }),
    });
  }

  if (!useTools) {
    const response = await fetchChatCompletion({
      model: model.modelName,
      temperature: MODEL_TEMPERATURE,
      messages: requestMessages,
      stream: true,
    });

    if (!response.ok) throw new Error(await response.text());
    await readOpenAIStream(response, port, signal, messageId);
    return "";
  }

  for (let step = 0; step < maxToolSteps; step++) {
    const response = await fetchChatCompletion({
      model: model.modelName,
      temperature: MODEL_TEMPERATURE,
      messages: requestMessages,
      stream: true,
      tools: availableTools,
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
    const toolCalls = streamResult.toolCalls;
    if (!toolCalls.length) return "";

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
      });
      const output = attachToolSources(
        toolName,
        input,
        rawOutput,
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
    }
  }

  requestMessages.push({
    role: "user",
    content:
      "<internal_instruction>Maximum browser tool steps reached. Do not call more tools. Summarize the findings and clearly state what is known, what remains uncertain, and the best next step for the user. Respond in the same language as the user's latest non-internal message.</internal_instruction>",
  });

  const fallbackResponse = await fetch(chatUrl, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: model.modelName,
      temperature: MODEL_TEMPERATURE,
      messages: requestMessages,
      stream: true,
    }),
  });

  if (!fallbackResponse.ok) throw new Error(await fallbackResponse.text());
  await readOpenAIStream(fallbackResponse, port, signal);
  return "";
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
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.modelName)}:generateContent?key=${encodeURIComponent(model.apiKey)}`;
  let contents: Array<Record<string, unknown>> = createGeminiContents(
    messages,
    true,
    uploadedAttachments,
    availableSkills,
  );
  let usesAttachmentPayload = hasImageAttachments(uploadedAttachments);

  async function fetchGemini(body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
      postText(port, attachmentRetryNotice, crypto.randomUUID(), signal, false);
    return fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, contents }),
    });
  }

  const availableTools = toolsForMode(
    mode,
    uploadedAttachments.length > 0,
    availableSkills.length > 0,
    !!(await storage.preferences.get()).imageGenerationEnabled,
  );
  const useTools = maxToolSteps > 0 && availableTools.length > 0;
  let responseSources = getMessageSources(messages);

  if (!useTools) {
    const response = await fetchGemini({
      systemInstruction: { parts: [{ text: system }] },
      contents,
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return (
      data.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("") || ""
    );
  }

  for (let step = 0; step < maxToolSteps; step++) {
    const response = await fetchGemini({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      ...(useTools
        ? {
            tools: [
              {
                functionDeclarations: availableTools.map(
                  (item) => item.function,
                ),
              },
            ],
          }
        : {}),
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
      return (
        parts.map((part: { text?: string }) => part.text || "").join("") || ""
      );

    const textBeforeTools = parts
      .map((part: { text?: string }) => part.text || "")
      .join("");
    if (textBeforeTools)
      postText(port, textBeforeTools, crypto.randomUUID(), signal, false);

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
      });
      const output = attachToolSources(
        toolName,
        input,
        rawOutput,
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
    }
    contents.push({ role: "user", parts: responseParts });
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
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("") || ""
  );
}

function attachToolSources(
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
  currentSources: ChatSource[],
) {
  if (!output || typeof output !== "object") return output;
  const record = output as Record<string, unknown>;
  const extracted = extractSourcesFromTool(toolName, input, record);
  if (toolName === BROWSER_TOOL_NAME.groupTabs && currentSources.length)
    return { ...record, _sources: currentSources };
  if (!extracted.length) return output;
  const { added } = assignChatSources(currentSources, extracted);
  return added.length ? { ...record, _sources: added } : output;
}

function mergeOutputSources(current: ChatSource[], output: unknown) {
  if (!output || typeof output !== "object") return current;
  const sources = (output as Record<string, unknown>)._sources;
  return Array.isArray(sources)
    ? assignChatSources(current, sources as ChatSource[]).sources
    : current;
}

function getMessageSources(messages: ChatMessage[]): ChatSource[] {
  const latest = messages[messages.length - 1];
  return Array.isArray(latest?.metadata?.sources)
    ? (latest.metadata.sources as ChatSource[])
    : [];
}

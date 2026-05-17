import { BROWSER_TOOL_NAME, UNKNOWN_TOOL_NAME } from "../shared/browser-tools";
import { MODEL_TEMPERATURE, STREAM_CHUNK_DELAY_MS } from "../shared/config";
import {
  AI_TEXT_CHUNK_TYPE,
  CHAT_PART_STATE,
  toolPartType,
  type AiStreamResponse,
  type ChatMessage,
  type ChatMode,
  type ProviderId,
  type Skill,
  type UploadedAttachment,
} from "../shared/types";
import { isToolError, pickTab } from "./tools";
import {
  createGeminiContents,
  createOpenAIRequestMessages,
  hasImageAttachments,
} from "./attachment-messages";
import { chunkText, parseToolArgs, postText } from "./message-helpers";
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
  );
  const useTools = maxToolSteps > 0 && availableTools.length > 0;

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
      const output = await executeContextAwareTool({
        toolName,
        input,
        uploadedAttachments,
        availableSkills,
      });
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

async function readOpenAIStream(
  response: Response,
  port: chrome.runtime.Port,
  signal: AbortSignal,
  preferredTextId?: string,
  deferTextUntilNoTools = false,
) {
  if (!response.body) throw new Error("Streaming response body is empty");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls: Array<{
    id?: string;
    type?: string;
    function: { name?: string; arguments?: string };
  }> = [];
  const textId = preferredTextId || crypto.randomUUID();
  const announcedToolIndexes = new Set<number>();
  let buffer = "";
  let content = "";
  let textStarted = false;
  let deferredTextPosted = false;

  function emitText(delta: string) {
    if (!delta) return;
    if (deferTextUntilNoTools) {
      content += delta;
      return;
    }
    if (!textStarted) {
      textStarted = true;
      post(port, {
        type: "chunk",
        chunk: { type: AI_TEXT_CHUNK_TYPE.textStart, id: textId },
      });
    }
    content += delta;
    post(port, {
      type: "chunk",
      chunk: { type: AI_TEXT_CHUNK_TYPE.textDelta, id: textId, delta },
    });
  }

  function postDeferredTextNote() {
    if (!deferTextUntilNoTools || deferredTextPosted || !content) return;
    deferredTextPosted = true;
    postText(port, content, textId, signal, false);
  }

  function consumeEvent(rawEvent: string) {
    const data = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;

    const payload = JSON.parse(data) as {
      choices?: Array<{
        delta?: {
          content?: string;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };
    const delta = payload.choices?.[0]?.delta;
    emitText(delta?.content || "");

    for (const toolDelta of delta?.tool_calls || []) {
      const index = toolDelta.index ?? toolCalls.length;
      const current = toolCalls[index] || { function: {} };
      toolCalls[index] = {
        ...current,
        id: toolDelta.id || current.id,
        type: toolDelta.type || current.type || "function",
        function: {
          name: toolDelta.function?.name || current.function.name,
          arguments: `${current.function.arguments || ""}${toolDelta.function?.arguments || ""}`,
        },
      };

      const next = toolCalls[index];
      if (!announcedToolIndexes.has(index) && next.id && next.function.name) {
        announcedToolIndexes.add(index);
        postDeferredTextNote();
        post(port, {
          type: "chunk",
          chunk: {
            type: toolPartType(next.function.name),
            toolCallId: next.id,
            toolName: next.function.name,
            state: CHAT_PART_STATE.inputStreaming,
            input: {},
          },
        });
      }
    }
  }

  while (true) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const event of events) consumeEvent(event);
  }

  buffer += decoder.decode();
  if (buffer.trim()) consumeEvent(buffer);
  if (textStarted)
    post(port, {
      type: "chunk",
      chunk: { type: AI_TEXT_CHUNK_TYPE.textEnd, id: textId },
    });

  const completeToolCalls = toolCalls.filter(
    (toolCall) => toolCall.function.name,
  );
  if (deferTextUntilNoTools && content) {
    if (completeToolCalls.length && !deferredTextPosted)
      postText(port, content, textId, signal, false);
    if (!completeToolCalls.length) postText(port, content, textId, signal);
  }

  return {
    content,
    toolCalls: completeToolCalls,
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
  );
  const useTools = maxToolSteps > 0 && availableTools.length > 0;

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
      const output = await executeContextAwareTool({
        toolName,
        input,
        uploadedAttachments,
        availableSkills,
      });
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

import { storage } from "../shared/storage";
import { MODEL_TEMPERATURE, STREAM_CHUNK_DELAY_MS } from "../shared/config";
import {
  AI_TEXT_CHUNK_TYPE,
  CHAT_PART_STATE,
  providerDefaultBaseUrls,
  type AiStreamResponse,
  type ChatMessage,
  type ChatMode,
  type ProviderId,
} from "../shared/types";
import {
  browserTools,
  isToolError,
  pickTab,
  safeExecuteBrowserTool,
} from "./tools";
import {
  chunkText,
  parseToolArgs,
  postText,
  renderUserMessageWithContext,
} from "./message-helpers";

function post(port: chrome.runtime.Port, message: AiStreamResponse) {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post ai-stream message", error);
  }
}

export async function resolveModel(modelId?: string) {
  const providers = await storage.provider.get();
  const preferences = await storage.preferences.get();
  const selectedModelId = modelId || preferences.selectedModelId;

  for (const [provider, config] of Object.entries(providers) as Array<
    [ProviderId, NonNullable<(typeof providers)[ProviderId]>]
  >) {
    const model = config.models?.find(
      (candidate) =>
        candidate.id === selectedModelId || candidate.name === selectedModelId,
    );
    if (model) {
      return {
        provider,
        apiKey: config.apiKey || "",
        baseUrl: config.baseUrl || providerDefaultBaseUrls[provider] || "",
        modelName: model.name || model.id,
      };
    }
  }

  const fallbackProvider = Object.entries(providers)[0] as
    | [ProviderId, NonNullable<(typeof providers)[ProviderId]>]
    | undefined;
  const fallbackModel = fallbackProvider?.[1].models?.[0];
  if (fallbackProvider && fallbackModel) {
    return {
      provider: fallbackProvider[0],
      apiKey: fallbackProvider[1].apiKey || "",
      baseUrl:
        fallbackProvider[1].baseUrl ||
        providerDefaultBaseUrls[fallbackProvider[0]] ||
        "",
      modelName: fallbackModel.name || fallbackModel.id,
    };
  }

  throw new Error("No model configured. Add an AI provider in Settings.");
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
    );
  }

  const baseUrl = model.baseUrl.replace(/\/$/, "");
  const chatUrl =
    model.provider === "ollama"
      ? `${baseUrl}/v1/chat/completions`
      : `${baseUrl}/chat/completions`;
  const requestMessages: Array<Record<string, unknown>> = [
    { role: "system", content: system },
    ...messages.map((message, index) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content:
        index === messages.length - 1 && message.role === "user"
          ? renderUserMessageWithContext(message)
          : message.content,
    })),
  ];

  if (mode === "Ask" || maxToolSteps <= 0) {
    const response = await fetch(chatUrl, {
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

    if (!response.ok) throw new Error(await response.text());
    await readOpenAIStream(response, port, signal, messageId);
    return "";
  }

  for (let step = 0; step < maxToolSteps; step++) {
    const response = await fetch(chatUrl, {
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
        tools: browserTools,
        tool_choice: "auto",
      }),
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
      const toolName = String(toolCall.function?.name || "unknown");
      const toolCallId = String(toolCall.id || crypto.randomUUID());
      const input = parseToolArgs(toolCall.function?.arguments);
      post(port, {
        type: "chunk",
        chunk: {
          type: `tool-${toolName}`,
          toolCallId,
          toolName,
          state: CHAT_PART_STATE.inputAvailable,
          input,
        },
      });
      const output = await safeExecuteBrowserTool(toolName, input);
      const hasError = isToolError(output);
      post(port, {
        type: "chunk",
        chunk: {
          type: `tool-${toolName}`,
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
            type: `tool-${next.function.name}`,
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
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.modelName)}:generateContent?key=${encodeURIComponent(model.apiKey)}`;
  const contents: Array<Record<string, unknown>> = messages.map(
    (message, index) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            index === messages.length - 1 && message.role === "user"
              ? renderUserMessageWithContext(message)
              : message.content,
        },
      ],
    }),
  );
  const useTools = mode !== "Ask" && maxToolSteps > 0;

  if (!useTools) {
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
      }),
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
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        ...(useTools
          ? {
              tools: [
                {
                  functionDeclarations: browserTools.map(
                    (item) => item.function,
                  ),
                },
              ],
            }
          : {}),
      }),
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
      const toolName = String(functionCall.name || "unknown");
      const toolCallId = crypto.randomUUID();
      const input = functionCall.args || {};
      post(port, {
        type: "chunk",
        chunk: {
          type: `tool-${toolName}`,
          toolCallId,
          toolName,
          state: CHAT_PART_STATE.inputAvailable,
          input,
        },
      });
      const output = await safeExecuteBrowserTool(toolName, input);
      const hasError = isToolError(output);
      post(port, {
        type: "chunk",
        chunk: {
          type: `tool-${toolName}`,
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
  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("") || ""
  );
}

import { UNKNOWN_TOOL_NAME } from "../shared/browser-tools";
import { base64FromDataUrl } from "../shared/attachments";
import { storage } from "../shared/storage";
import {
  type AgentCapabilities,
  type AgentWorkspace,
  type AiStreamResponse,
  type ChatMessage,
  type McpServerConfig,
  type Skill,
  type UploadedAttachment,
} from "../shared/types";
import {
  createGeminiContents,
  hasImageAttachments,
} from "./attachment-messages";
import { applyGeminiContextBudget } from "./context-budget";
import { post, postTextStream } from "./message-helpers";
import {
  geminiText,
  getMessageSources,
  latestUserMessageText,
  normalizeGeminiUsage,
  type ProviderTextResult,
} from "./provider-output";
import { postContextBudget } from "./provider-metrics";
import {
  injectQueuedGeminiMessages,
  type QueuedUserMessage,
} from "./provider-queued-messages";
import { createToolResolver } from "./provider-tools";
import { runProviderTool } from "./provider-tool-runner";

export async function requestGemini(
  model: { apiKey: string; modelName: string },
  system: string,
  messages: ChatMessage[],
  capabilities: AgentCapabilities,
  maxToolSteps: number,
  signal: AbortSignal,
  port: chrome.runtime.Port,
  chatId?: string,
  attachmentRetryNotice?: string,
  uploadedAttachments: UploadedAttachment[] = [],
  availableSkills: Skill[] = [],
  mcpServers: McpServerConfig[] = [],
  workspace?: AgentWorkspace,
  drainQueuedMessages: () => QueuedUserMessage[] = () => [],
): Promise<ProviderTextResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.modelName)}:generateContent?key=${encodeURIComponent(model.apiKey)}`;
  let contents: Array<Record<string, unknown>> = createGeminiContents(
    messages,
    true,
    uploadedAttachments,
    availableSkills,
    workspace,
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
      const result = await runProviderTool({
        toolName,
        toolCallId,
        input,
        port,
        chatId,
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
      responseParts.push({
        functionResponse: { name: toolName, response: result.output },
      });
      if (result.visionImage) {
        responseParts.push({
          text: "The image fetched by readFileFromUrl is attached for visual inspection. Use vision to answer the user's image question.",
        });
        responseParts.push({
          inline_data: {
            mime_type: result.visionImage.type || "image/png",
            data: base64FromDataUrl(result.visionImage.dataUrl),
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

import { browserTools } from "../../src/background/tool-schema";
import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";
import { createSystemPrompt } from "../../src/shared/system-prompt";
import {
  CHAT_PART_STATE,
  isToolPartType,
  toolPartType,
} from "../../src/shared/types";
import type {
  Chat,
  ChatMessage,
  ChatMode,
  ChatPart,
  Preferences,
  RunMetrics,
} from "../../src/shared/types";

type OpenAiExportMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content?: string | null;
      tool_calls?: OpenAiToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type OpenAiImportPayload = {
  messages?: Array<Record<string, unknown>>;
  sources?: unknown;
};

export function exportChatAsOpenAiJson(
  chat: Chat | undefined,
  mode: ChatMode,
  preferences?: Preferences,
) {
  if (!chat) return;
  const imageGenerationEnabled = !!preferences?.imageGenerationEnabled;
  const payload = {
    messages: [
      {
        role: "system" as const,
        content: createSystemPrompt(mode, { imageGenerationEnabled }),
      },
      ...chat.messages.flatMap(toOpenAiMessages),
    ],
    tools: imageGenerationEnabled
      ? browserTools
      : browserTools.filter(
          (tool) => tool.function.name !== BROWSER_TOOL_NAME.generateImage,
        ),
    sources: chat.sources || [],
    metrics: exportMetrics(chat),
    parallel_tool_calls: true,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(chat.title || "chat")}.openai.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportMetrics(chat: Chat) {
  const messages = chat.messages
    .filter((message) => message.role === "assistant")
    .map((message) => ({
      message_id: message.id,
      metrics: message.metadata?.runMetrics as RunMetrics | undefined,
    }))
    .filter((item) => item.metrics && Object.keys(item.metrics).length > 0);
  return messages.length ? { messages } : undefined;
}

export async function importChatFromOpenAiJson(file: File): Promise<Chat> {
  const payload = JSON.parse(await file.text()) as OpenAiImportPayload;
  if (!Array.isArray(payload.messages)) throw new Error("Invalid chat JSON");

  const now = Date.now();
  const messages: ChatMessage[] = [];
  const toolParts = new Map<string, ChatPart>();
  for (const item of payload.messages) {
    const role = String(item.role || "");
    if (role === "system") continue;
    if (role === "tool") {
      const part = toolParts.get(String(item.tool_call_id || ""));
      if (!part) continue;
      const output = parseJsonString(item.content);
      part.output = output;
      part.state = recordValue(output).error
        ? CHAT_PART_STATE.outputError
        : CHAT_PART_STATE.outputAvailable;
      continue;
    }
    if (role !== "user" && role !== "assistant") continue;

    const content = stringValue(item.content);
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      createdAt: now + messages.length,
    };
    if (role === "assistant") {
      const parts = assistantImportParts(item, content, toolParts);
      if (parts.length) message.parts = parts;
    }
    messages.push(message);
  }

  return {
    id: crypto.randomUUID(),
    title:
      safeFilename(file.name.replace(/\.openai\.json$/i, "")) ||
      "Imported chat",
    messages,
    sources: Array.isArray(payload.sources)
      ? (payload.sources as Chat["sources"])
      : [],
    createdAt: now,
    updatedAt: now,
  };
}

function assistantImportParts(
  item: Record<string, unknown>,
  content: string,
  toolParts: Map<string, ChatPart>,
) {
  const parts: ChatPart[] = [];
  if (content.trim())
    parts.push({ id: crypto.randomUUID(), type: "text", text: content });
  const toolCalls = Array.isArray(item.tool_calls) ? item.tool_calls : [];
  for (const call of toolCalls) {
    const record = recordValue(call);
    const fn = recordValue(record.function);
    const name = stringValue(fn.name) || BROWSER_TOOL_NAME.openNewTabWithURL;
    const part: ChatPart = {
      id: stringValue(record.id) || crypto.randomUUID(),
      type: toolPartType(name),
      toolName: name,
      state: CHAT_PART_STATE.inputAvailable,
      input: parseJsonString(fn.arguments),
    };
    parts.push(part);
    toolParts.set(part.id, part);
  }
  return parts;
}

function toOpenAiMessages(message: ChatMessage): OpenAiExportMessage[] {
  if (message.role === "assistant" && message.parts?.length)
    return assistantPartsToOpenAiMessages(message);
  if (message.role === "tool") return [];
  if (!message.content.trim()) return [];
  if (message.role === "assistant")
    return [{ role: "assistant", content: message.content }];
  return [{ role: message.role, content: message.content }];
}

function assistantPartsToOpenAiMessages(
  message: ChatMessage,
): OpenAiExportMessage[] {
  const messages: OpenAiExportMessage[] = [];
  let text = "";
  for (const part of message.parts || []) {
    if (part.type === "text" || part.type === "reasoning") {
      text += part.text || "";
      continue;
    }
    if (!isToolPartType(part.type)) continue;
    const toolCall = openAiToolCall(part);
    if (!toolCall) continue;
    messages.push({
      role: "assistant",
      content: text.trim() ? text : null,
      tool_calls: [toolCall],
    });
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: toolOutputContent(part),
    });
    text = "";
  }
  if (text.trim()) messages.push({ role: "assistant", content: text });
  if (!messages.length && message.content.trim())
    messages.push({ role: "assistant", content: message.content });
  return messages;
}

function openAiToolCall(part: ChatPart): OpenAiToolCall | null {
  const name = part.toolName || part.type.replace(/^tool-/, "");
  if (!name) return null;
  return {
    id: part.id,
    type: "function",
    function: {
      name,
      arguments: jsonString(part.input ?? {}),
    },
  };
}

function toolOutputContent(part: ChatPart) {
  if (part.output !== undefined) return jsonString(part.output);
  if (part.error) return jsonString({ error: part.error });
  return "{}";
}

function jsonString(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function parseJsonString(value: unknown) {
  if (typeof value !== "string") return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeFilename(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

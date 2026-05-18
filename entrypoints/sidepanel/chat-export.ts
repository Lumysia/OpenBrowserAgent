import { browserTools } from "../../src/background/tool-schema";
import { createSystemPrompt } from "../../src/shared/system-prompt";
import { isToolPartType } from "../../src/shared/types";
import type {
  Chat,
  ChatMessage,
  ChatMode,
  ChatPart,
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

export function exportChatAsOpenAiJson(chat: Chat | undefined, mode: ChatMode) {
  if (!chat) return;
  const payload = {
    messages: [
      { role: "system" as const, content: createSystemPrompt(mode) },
      ...chat.messages.flatMap(toOpenAiMessages),
    ],
    tools: browserTools,
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

function safeFilename(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

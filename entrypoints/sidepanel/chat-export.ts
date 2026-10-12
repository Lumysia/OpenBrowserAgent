import { describeRun } from "../../src/shared/run-description";
import {
  parseToolResultText,
  toolModelResult,
  toolResultText,
  turnSteps,
} from "../../src/shared/tool-results";
import {
  CHAT_PART_STATE,
  toolNameFromPartType,
  toolPartType,
} from "../../src/shared/types";
import type {
  Chat,
  ChatMessage,
  Agent,
  ChatPart,
  RunMetrics,
  ToolPartType,
} from "../../src/shared/types";

type OpenAiExportMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content?: string | null;
      reasoning_content?: string;
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
  tool_errors?: unknown;
};

// The system prompt and tools are the ones a new run of the agent starts
// with today, as the background builds them. Tool messages hold the text the
// model received for each call; calls whose result was an error are listed
// in `tool_errors`, as the format has no field for it.
export async function exportChatAsOpenAiJson(
  chat: Chat | undefined,
  agent: Agent,
) {
  if (!chat) return;
  const payload = chatToOpenAiPayload(chat, await describeRun(agent.id));
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

export function chatToOpenAiPayload(
  chat: Chat,
  run: { system: string; tools: unknown[] },
) {
  return {
    messages: [
      { role: "system" as const, content: run.system },
      ...chat.messages.flatMap(toOpenAiMessages),
    ],
    tool_errors: toolErrors(chat),
    tools: run.tools,
    sources: chat.sources || [],
    metrics: exportMetrics(chat),
    parallel_tool_calls: true,
  };
}

function toolErrors(chat: Chat) {
  return chat.messages.flatMap((message) =>
    message.role === "assistant"
      ? turnSteps(message.parts || []).flatMap((step) =>
          step.calls
            .filter((call) => toolModelResult(call).isError)
            .map((call) => call.id),
        )
      : [],
  );
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
  const errors = new Set(
    Array.isArray(payload.tool_errors) ? payload.tool_errors.map(String) : [],
  );
  for (const item of payload.messages) {
    const role = String(item.role || "");
    if (role === "system") continue;
    if (role === "tool") {
      const part = toolParts.get(String(item.tool_call_id || ""));
      if (!part) continue;
      part.result = parseToolResultText(stringValue(item.content));
      part.state = errors.has(part.id)
        ? CHAT_PART_STATE.outputError
        : CHAT_PART_STATE.outputAvailable;
      continue;
    }
    if (role !== "user" && role !== "assistant") continue;

    const content = stringValue(item.content);
    const previous = messages[messages.length - 1];
    // The responses of one assistant turn form one chat message.
    if (role === "assistant" && previous?.role === "assistant") {
      previous.content += content;
      previous.parts = [
        ...(previous.parts || []),
        ...assistantImportParts(item, content, toolParts),
      ];
      continue;
    }
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
  const reasoning = stringValue(item.reasoning_content);
  if (reasoning.trim())
    parts.push({ id: crypto.randomUUID(), type: "reasoning", text: reasoning });
  if (content.trim())
    parts.push({ id: crypto.randomUUID(), type: "text", text: content });
  const toolCalls = Array.isArray(item.tool_calls) ? item.tool_calls : [];
  const step = crypto.randomUUID();
  for (const call of toolCalls) {
    const record = recordValue(call);
    const fn = recordValue(record.function);
    const name = stringValue(fn.name);
    if (!name) continue;
    const part: ChatPart = {
      id: stringValue(record.id) || crypto.randomUUID(),
      type: toolPartType(name),
      toolName: name,
      state: CHAT_PART_STATE.inputAvailable,
      input: parseJsonString(fn.arguments),
      step,
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

// One assistant message per model response, followed by the results of its
// calls, as the model saw them.
function assistantPartsToOpenAiMessages(
  message: ChatMessage,
): OpenAiExportMessage[] {
  const messages = turnSteps(message.parts || []).flatMap(
    (step): OpenAiExportMessage[] =>
      !step.text.trim() && !step.calls.length
        ? []
        : [
            {
              role: "assistant",
              content: step.text.trim() ? step.text : null,
              ...(step.reasoning.trim()
                ? { reasoning_content: step.reasoning }
                : {}),
              ...(step.calls.length
                ? { tool_calls: step.calls.map(openAiToolCall) }
                : {}),
            },
            ...step.calls.map((call): OpenAiExportMessage => ({
              role: "tool",
              tool_call_id: call.id,
              content: toolResultText(toolModelResult(call)),
            })),
          ],
  );
  if (!messages.length && message.content.trim())
    messages.push({ role: "assistant", content: message.content });
  return messages;
}

function openAiToolCall(part: ChatPart): OpenAiToolCall {
  return {
    id: part.id,
    type: "function",
    function: {
      name: part.toolName || toolNameFromPartType(part.type as ToolPartType),
      arguments: jsonString(part.input ?? {}),
    },
  };
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

import type {
  Api,
  AssistantMessage,
  ImageContent,
  Message,
  Model,
  ToolCall,
} from "@earendil-works/pi-ai";
import {
  base64FromDataUrl,
  isVisionImageMimeType,
} from "../../shared/attachments";
import { toolModelResult, turnSteps } from "../../shared/tool-results";
import {
  toolNameFromPartType,
  type ChatMessage,
  type ChatPart,
  type ToolPartType,
  type UploadedAttachment,
} from "../../shared/types";
import { assistantMessage } from "../pi-provider";
import { getUploadedAttachments, renderMessageText } from "../message-helpers";
import { DROPPED_IMAGE, shrinkArguments } from "./engine";
import { CONTEXT_POLICY, tokenChars } from "./policy";

export type HistoryOptions = {
  model: Model<Api>;
  // Attachments of the request, for the latest user message.
  attachments: UploadedAttachment[];
  // Whether the request declares tools. Providers reject tool calls in a
  // request without tools, so earlier calls are then replayed as text.
  tools: boolean;
  // Tools whose long arguments shrink once applied (as in the engine).
  compactArgs: (toolName: string) => boolean;
};

// Assistant messages replayed from the chat are marked as coming from
// another model, so Pi adapts their tool call ids to the current provider
// and never treats them as the provider's own stored items.
const REPLAYED_PROVIDER = "openbrowseragent-history";

// The chat as Pi messages. An earlier assistant turn keeps its tool calls
// and their results, with each result shortened (see replayedResults); the
// rendering depends only on the turn itself, so it stays the same from one
// request to the next and the cached prefix holds.
export function historyMessages(
  messages: ChatMessage[],
  options: HistoryOptions,
): Message[] {
  return messages.flatMap((message, index): Message[] => {
    const latest = index === messages.length - 1;
    if (message.role === "assistant") return assistantTurn(message, options);
    const text = renderMessageText(
      message,
      latest,
      latest ? options.attachments : [],
    );
    const images = (
      latest && options.attachments.length
        ? options.attachments
        : getUploadedAttachments(message)
    )
      .filter(
        (item) =>
          item.kind === "image" &&
          item.dataUrl &&
          isVisionImageMimeType(item.type),
      )
      .map((item) => imageContent(item.dataUrl!, item.type));
    return [
      {
        role: "user",
        timestamp: message.createdAt,
        content: [{ type: "text", text }, ...images],
      },
    ];
  });
}

export function imageContent(dataUrl: string, mimeType?: string): ImageContent {
  return {
    type: "image",
    data: base64FromDataUrl(dataUrl),
    mimeType: mimeType || dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png",
  };
}

function assistantTurn(
  message: ChatMessage,
  options: HistoryOptions,
): Message[] {
  const steps = turnSteps(message.parts || []);
  const reply = (
    content: AssistantMessage["content"],
    toolUse = false,
  ): AssistantMessage => ({
    ...assistantMessage(options.model),
    provider: REPLAYED_PROVIDER,
    content,
    stopReason: toolUse ? "toolUse" : "stop",
    timestamp: message.createdAt,
  });
  // Reasoning is not replayed: only the model that wrote it could use it.
  if (!steps.some((step) => step.calls.length))
    return [reply([{ type: "text", text: message.content }])];
  const results = replayedResults(steps.flatMap((step) => step.calls));
  if (!options.tools)
    return [
      reply([
        {
          type: "text",
          text: steps
            .map((step) =>
              [
                step.text,
                ...step.calls.map((call) => callText(call, results, options)),
              ]
                .filter((item) => item.trim())
                .join("\n\n"),
            )
            .join("\n\n"),
        },
      ]),
    ];
  const replayed = steps.filter(
    (step) => step.text.trim() || step.calls.length,
  );
  return replayed.flatMap((step): Message[] => [
    reply(
      [
        ...(step.text.trim()
          ? [{ type: "text" as const, text: step.text }]
          : []),
        ...step.calls.map((call): ToolCall => ({
          type: "toolCall",
          id: call.id,
          name: toolName(call),
          arguments: callArguments(call, options),
        })),
      ],
      step.calls.length > 0,
    ),
    ...step.calls.map((call): Message => ({
      role: "toolResult",
      toolCallId: call.id,
      toolName: toolName(call),
      content: [{ type: "text", text: results.get(call.id)!.text }],
      isError: results.get(call.id)!.isError,
      timestamp: message.createdAt,
    })),
  ]);
}

// Each result is shortened to a head; within the turn's budget the latest
// results (usually the checks of what was done) are kept, and older ones
// become one-line stubs. Full outputs stay readable by artifact handle.
function replayedResults(calls: ChatPart[]) {
  const outputChars = tokenChars(CONTEXT_POLICY.historyToolOutputTokens);
  let budget = tokenChars(CONTEXT_POLICY.historyTurnToolTokens);
  const results = new Map<string, { text: string; isError: boolean }>();
  for (const call of [...calls].reverse()) {
    const result = toolModelResult(call);
    let text = shortened(result.text, outputChars, result.artifact);
    if (text.length > budget) text = stub(result.text.length, result.artifact);
    budget = Math.max(0, budget - text.length);
    results.set(call.id, {
      text: result.image ? `${text}\n${DROPPED_IMAGE}` : text,
      isError: result.isError,
    });
  }
  return results;
}

function shortened(text: string, max: number, artifact?: string) {
  if (text.length <= max) return text;
  // Cut at a line end so no line (and no ref) is shown half.
  const cut = text.slice(0, max);
  const head = cut.slice(0, Math.max(cut.lastIndexOf("\n"), max / 2));
  return `${head}\n[Shortened in this earlier turn: showed ${head.length} of ${text.length} characters.${fullOutput(artifact)}]`;
}

function stub(length: number, artifact?: string) {
  return `[Output of an earlier turn left out to save context: ${length} characters.${fullOutput(artifact)}]`;
}

function fullOutput(artifact?: string) {
  return artifact ? ` The full output is "${artifact}" (use read).` : "";
}

function callText(
  call: ChatPart,
  results: Map<string, { text: string; isError: boolean }>,
  options: HistoryOptions,
) {
  const result = results.get(call.id)!;
  return `<tool_call name="${toolName(call)}">${JSON.stringify(callArguments(call, options))}</tool_call>\n<tool_result${result.isError ? ' error="true"' : ""}>\n${result.text}\n</tool_result>`;
}

function toolName(part: ChatPart) {
  return part.toolName || toolNameFromPartType(part.type as ToolPartType);
}

function callArguments(
  part: ChatPart,
  options: HistoryOptions,
): ToolCall["arguments"] {
  const input =
    part.input && typeof part.input === "object" && !Array.isArray(part.input)
      ? (part.input as ToolCall["arguments"])
      : {};
  return options.compactArgs(toolName(part))
    ? (shrinkArguments(input) as ToolCall["arguments"])
    : input;
}

import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core";
import type { Api, ImageContent, Message, Model } from "@earendil-works/pi-ai";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import {
  AI_TEXT_CHUNK_TYPE,
  CHAT_PART_STATE,
  toolPartType,
  type AgentCapabilities,
  type AgentWorkspace,
  type AiStreamResponse,
  type ChatMessage,
  type McpServerConfig,
  type Skill,
  type TokenUsage,
  type UploadedAttachment,
} from "../shared/types";
import {
  base64FromDataUrl,
  isVisionImageMimeType,
} from "../shared/attachments";
import { storage } from "../shared/storage";
import { renderMessageText } from "./attachment-messages";
import { getUploadedAttachments } from "./message-helpers";
import { applyPiContextBudget, messageText } from "./pi-context-budget";
import {
  assistantMessage,
  createProviderStream,
  piModel,
  type ProviderModel,
} from "./pi-provider";
import { createToolResolver } from "./provider-tools";
import { runProviderTool } from "./provider-tool-runner";
import {
  addTokenUsage,
  getMessageSources,
  latestUserMessageText,
} from "./provider-output";
import { isToolError } from "./tool-utils";
import {
  buildCompactionPrompt,
  COMPACTION_SYSTEM_PROMPT,
  renderCompactionContext,
} from "./compaction-prompt";
import {
  isQueuedMessage,
  postToSession,
  type QueuedUserMessage,
  type StreamSession,
} from "./stream-sessions";

const TOOL_LIMIT_INSTRUCTION =
  "<internal_instruction>Maximum browser tool steps reached. Do not call more tools. Summarize the findings and clearly state what is known, what remains uncertain, and the best next step for the user. Respond in the same language as the user's latest non-internal message.</internal_instruction>";

export async function runPiAgent(options: {
  session: StreamSession;
  model: ProviderModel;
  system: string;
  messages: ChatMessage[];
  capabilities: AgentCapabilities;
  maxToolSteps: number;
  messageId?: string;
  attachmentRetryNotice?: string;
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
  mcpServers: McpServerConfig[];
  workspace?: AgentWorkspace;
}) {
  const {
    session,
    model,
    system,
    messages,
    capabilities,
    maxToolSteps,
    attachmentRetryNotice,
    uploadedAttachments,
    availableSkills,
    mcpServers,
    workspace,
  } = options;
  const { agent, chatId } = session;
  const signal = session.abortController.signal;
  const post = (message: AiStreamResponse) => postToSession(session, message);
  const preferences = await storage.preferences.get();
  signal.throwIfAborted();
  const events = createEventHandler(post, options.messageId);
  const resolved = piModel(model);
  const stream = createProviderStream(
    model,
    preferences.reasoningEffort,
    () => {
      if (!attachmentRetryNotice) return;
      const id = crypto.randomUUID();
      post({ type: "chunk", chunk: { type: "text-start", id } });
      post({
        type: "chunk",
        chunk: {
          type: "text-delta",
          id,
          delta: `${attachmentRetryNotice}\n\n`,
        },
      });
      post({ type: "chunk", chunk: { type: "text-end", id } });
    },
  );
  const resolver = createToolResolver({
    capabilities,
    uploadedAttachments,
    availableSkills,
    preferences,
    latestUserText: latestUserMessageText(messages),
    mcpServers,
    workspace,
  });
  let sources = getMessageSources(messages);
  let steps = 0;
  let limitAnnounced = false;
  const tools = (): AgentTool[] =>
    steps >= maxToolSteps
      ? []
      : resolver.availableTools().map((tool) => ({
          name: tool.function.name,
          label: tool.function.name,
          description: tool.function.description || "",
          parameters: tool.function.parameters as AgentTool["parameters"],
          async execute(toolCallId, input, toolSignal) {
            const result = await runProviderTool({
              toolName: tool.function.name,
              toolCallId,
              input: input as Record<string, unknown>,
              session,
              messageId: events.messageId,
              uploadedAttachments,
              availableSkills,
              capabilities,
              workspace,
              responseSources: sources,
              loadedToolNames: resolver.loadedToolNames,
              signal: toolSignal,
            });
            sources = result.responseSources;
            const image = result.visionImage;
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result.modelOutput) ?? "null",
                },
                ...(image ? [imageContent(image.dataUrl, image.type)] : []),
              ],
              details: { output: result.output },
              isError: isToolError(result.output),
            };
          },
        }));
  agent.state.model = resolved;
  agent.state.tools = tools();
  agent.state.messages = [
    { role: "system", content: system, timestamp: Date.now() },
  ];
  agent.streamFunction = stream;
  agent.sessionId = chatId;
  let summary: string | undefined;
  let summaryAttempted = false;
  // Pi has injected the whole consumed batch here. Publish it before context
  // processing (including compaction requests), even if the provider is slow.
  agent.prepareRequest = () => events.acknowledgeConsumedMessages();
  agent.transformContext = async (transcript, abortSignal) => {
    let budget = applyPiContextBudget(
      transcript,
      preferences,
      model.contextLength,
      summary,
    );
    if (budget.report.prunedMessages && !summaryAttempted) {
      summaryAttempted = true;
      // One provider request, never an auxiliary agent loop. Failure keeps the
      // normal pruning placeholder.
      try {
        const context = renderCompactionContext(transcript, 220_000);
        const result = await (
          await stream(
            resolved,
            normalizeContext({
              systemPrompt: COMPACTION_SYSTEM_PROMPT,
              messages: [
                {
                  role: "user",
                  timestamp: Date.now(),
                  content: buildCompactionPrompt({ context }),
                },
              ],
            }),
            { signal: abortSignal },
          )
        ).result();
        if (result.stopReason !== "error" && result.stopReason !== "aborted")
          summary = messageText(result).trim() || undefined;
        if (summary)
          budget = applyPiContextBudget(
            transcript,
            preferences,
            model.contextLength,
            summary,
          );
      } catch {
        /* Best-effort compaction must not prevent normal generation. */
      }
    }
    post({ type: "metrics", metrics: { contextBudget: budget.report } });
    return budget.messages;
  };
  agent.finishTurn = ({ toolResults }) => {
    if (toolResults.length) steps++;
    // Bound a model that still returns calls after its tools were removed.
    if (steps > maxToolSteps) return { action: "end" };
  };
  agent.prepareNextTurnWithContext = ({ context }) => {
    const nextTools = tools();
    agent.state.tools = nextTools;
    const announce =
      steps >= maxToolSteps && maxToolSteps > 0 && !limitAnnounced;
    if (announce) limitAnnounced = true;
    return {
      context: { ...context, tools: nextTools },
      messages: announce
        ? [
            {
              role: "user" as const,
              timestamp: Date.now(),
              content: TOOL_LIMIT_INSTRUCTION,
            },
          ]
        : [],
    };
  };
  const unsubscribe = agent.subscribe((event) => events.handle(event));
  // agent.abort() also aborts the provider request and every tool signal.
  const abort = () => agent.abort();
  signal.addEventListener("abort", abort, { once: true });
  try {
    await agent.prompt(
      piMessages(
        resolved,
        messages,
        uploadedAttachments,
        availableSkills,
        workspace,
      ),
    );
    signal.throwIfAborted();
    if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
    return { usage: events.usage };
  } finally {
    signal.removeEventListener("abort", abort);
    unsubscribe();
  }
}

function piMessages(
  model: Model<Api>,
  messages: ChatMessage[],
  attachments: UploadedAttachment[],
  skills: Skill[],
  workspace?: AgentWorkspace,
): Message[] {
  return messages.map((message, index): Message => {
    const latest = index === messages.length - 1;
    const text = renderMessageText(
      message,
      latest,
      latest ? attachments : [],
      latest ? skills : [],
      latest ? workspace : undefined,
    );
    if (message.role === "assistant")
      return {
        ...assistantMessage(model),
        content: [{ type: "text", text }],
        timestamp: message.createdAt,
      };
    const images = (
      latest && attachments.length
        ? attachments
        : getUploadedAttachments(message)
    )
      .filter(
        (item) =>
          item.kind === "image" &&
          item.dataUrl &&
          isVisionImageMimeType(item.type),
      )
      .map((item) => imageContent(item.dataUrl!, item.type));
    return {
      role: "user",
      timestamp: message.createdAt,
      content: [{ type: "text", text }, ...images],
    };
  });
}

function imageContent(dataUrl: string, mimeType?: string): ImageContent {
  return {
    type: "image",
    data: base64FromDataUrl(dataUrl),
    mimeType: mimeType || dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png",
  };
}

const TEXT_CHUNKS = {
  text: {
    start: AI_TEXT_CHUNK_TYPE.textStart,
    delta: AI_TEXT_CHUNK_TYPE.textDelta,
    end: AI_TEXT_CHUNK_TYPE.textEnd,
  },
  // Reasoning renders as a text note in the sidepanel.
  thinking: {
    start: AI_TEXT_CHUNK_TYPE.textNoteStart,
    delta: AI_TEXT_CHUNK_TYPE.textNoteDelta,
    end: AI_TEXT_CHUNK_TYPE.textNoteEnd,
  },
};

// Translates Pi events into the sidepanel stream protocol.
function createEventHandler(
  post: (message: AiStreamResponse) => void,
  initialMessageId?: string,
) {
  let assistantId = initialMessageId || crypto.randomUUID();
  let turnId = crypto.randomUUID();
  let usage: TokenUsage | undefined;
  const openParts = new Map<string, string>();
  const announcedCalls = new Set<string>();
  const consumed: QueuedUserMessage[] = [];
  const chunk = (value: Record<string, unknown>) =>
    post({ type: "chunk", chunk: value });
  return {
    get messageId() {
      return assistantId;
    },
    get usage() {
      return usage;
    },
    acknowledgeConsumedMessages() {
      if (!consumed.length) return;
      const createdAt = Date.now();
      const batch = consumed.splice(0);
      assistantId = crypto.randomUUID();
      post({
        type: "queuedMessages",
        messages: batch.map((message, index) => ({
          id: message.queueId,
          content: String(message.content),
          createdAt: createdAt + index,
        })),
        assistantMessageId: assistantId,
        createdAt: createdAt + batch.length,
      });
    },
    handle(event: AgentEvent) {
      if (event.type === "message_start") {
        if (isQueuedMessage(event.message)) consumed.push(event.message);
        if (event.message.role === "assistant") turnId = crypto.randomUUID();
      }
      if (event.type === "message_update") {
        const update = event.assistantMessageEvent;
        if (!("contentIndex" in update)) return;
        if (update.type.startsWith("toolcall_")) {
          // Announce each call once. Argument snapshots per delta would pile
          // up in the replay buffer; execute() sends the validated input.
          const call = update.partial.content[update.contentIndex];
          if (call?.type !== "toolCall" || !call.id || !call.name) return;
          if (announcedCalls.has(call.id)) return;
          announcedCalls.add(call.id);
          chunk({
            type: toolPartType(call.name),
            toolCallId: call.id,
            toolName: call.name,
            state: CHAT_PART_STATE.inputStreaming,
          });
          return;
        }
        const id = `${turnId}:${update.contentIndex}`;
        const [kind, phase] = update.type.split("_") as [
          keyof typeof TEXT_CHUNKS,
          string,
        ];
        const types = TEXT_CHUNKS[kind];
        if (!types) return;
        if (phase === "start") {
          openParts.set(id, types.end);
          chunk({ type: types.start, id });
        } else if (phase === "delta" && "delta" in update) {
          chunk({ type: types.delta, id, delta: update.delta });
        } else if (phase === "end") {
          openParts.delete(id);
          chunk({ type: types.end, id });
        }
      }
      if (
        event.type === "tool_execution_end" &&
        event.isError &&
        !event.result.details?.output
      ) {
        // Pi validation and unknown-tool errors never reach execute().
        chunk({
          type: toolPartType(event.toolName),
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          state: CHAT_PART_STATE.outputError,
          output: {
            error: event.result.content
              ?.map((part: { text?: string }) => part.text || "")
              .join("\n"),
          },
        });
      }
      if (event.type === "message_end" && event.message.role === "assistant") {
        // A stream that fails mid-part never sends its end event.
        for (const [id, type] of openParts) chunk({ type, id });
        openParts.clear();
        const current = event.message.usage;
        usage = addTokenUsage(usage, {
          inputTokens: current.input + current.cacheRead + current.cacheWrite,
          outputTokens: current.output,
          totalTokens: current.totalTokens,
          cachedInputTokens: current.cacheRead,
          cacheWriteTokens: current.cacheWrite,
          reasoningTokens: current.reasoning,
        });
      }
    },
  };
}

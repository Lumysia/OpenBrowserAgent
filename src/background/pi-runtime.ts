import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core";
import type {
  Api,
  ImageContent,
  Message,
  Model,
  Usage,
} from "@earendil-works/pi-ai";
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
  type UploadedAttachment,
} from "../shared/types";
import {
  base64FromDataUrl,
  isVisionImageMimeType,
} from "../shared/attachments";
import { storage } from "../shared/storage";
import { renderMessageText } from "./attachment-messages";
import { getUploadedAttachments } from "./message-helpers";
import {
  assistantMessage,
  createProviderStream,
  piModel,
  requestText,
  type ProviderModel,
} from "./pi-provider";
import { indexedDbArtifacts, type ArtifactStore } from "../shared/artifacts";
import { createContextEngine } from "./context/engine";
import { runsInParallel } from "./context/policy";
import { createUsageMeter } from "./run-usage";
import { createToolResolver } from "./provider-tools";
import { runProviderTool } from "./provider-tool-runner";
import { getMessageSources, latestUserMessageText } from "./provider-output";
import { isToolError } from "./tool-utils";
import {
  isQueuedMessage,
  postToSession,
  type QueuedUserMessage,
  type StreamSession,
} from "./stream-sessions";

// Tools stay declared for the whole run so the cached prefix never changes.
// Past the step limit, calls are answered with this instead of running.
const TOOL_LIMIT_NOTICE =
  "Not executed: the tool step limit for this run is reached. Do not call more tools. Answer now with what you know, say what remains uncertain, and suggest the best next step.";

export async function runPiAgent(options: {
  session: StreamSession;
  model: ProviderModel;
  helperModel: ProviderModel;
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
  artifacts?: ArtifactStore;
}) {
  const {
    session,
    model,
    helperModel,
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
  const context = createContextEngine({
    chatId,
    store: options.artifacts || indexedDbArtifacts,
    contextWindow: model.contextLength,
    async summarize(system, prompt, abortSignal) {
      const result = await requestText(
        helperModel,
        { system, prompt },
        abortSignal,
      );
      events.recordUsage(result.usage);
      return result.text;
    },
    onCompacted: (summary) =>
      post({
        type: "chunk",
        chunk: {
          type: AI_TEXT_CHUNK_TYPE.contextSummary,
          id: crypto.randomUUID(),
          text: summary,
        },
      }),
  });
  const resolver = createToolResolver({
    capabilities,
    uploadedAttachments,
    availableSkills,
    preferences,
    latestUserText: latestUserMessageText(messages),
    mcpServers,
    workspace,
  });
  // Read and written synchronously around each tool's await, so parallel
  // calls never assign the same source id twice.
  const sources = { current: getMessageSources(messages) };
  let steps = 0;
  const tools = (): AgentTool[] =>
    maxToolSteps <= 0
      ? []
      : resolver.availableTools().map((tool) => ({
          name: tool.function.name,
          label: tool.function.name,
          description: tool.function.description || "",
          parameters: tool.function.parameters as AgentTool["parameters"],
          executionMode: runsInParallel(tool.function.name)
            ? "parallel"
            : "sequential",
          async execute(toolCallId, params, toolSignal) {
            const input = params as Record<string, unknown>;
            const result = await runProviderTool({
              toolName: tool.function.name,
              toolCallId,
              input,
              session,
              messageId: events.messageId,
              uploadedAttachments,
              availableSkills,
              capabilities,
              workspace,
              sources,
              loadedToolNames: resolver.loadedToolNames,
              readArtifact: context.read,
              signal: toolSignal,
            });
            const image = result.visionImage;
            const text = await context.acceptToolOutput({
              toolCallId,
              toolName: tool.function.name,
              input,
              text:
                typeof result.modelOutput === "string"
                  ? result.modelOutput
                  : (JSON.stringify(result.modelOutput) ?? "null"),
            });
            return {
              content: [
                { type: "text" as const, text },
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
  // Pi has injected the whole consumed batch here. Publish it before context
  // processing (including compaction requests), even if the provider is slow.
  agent.prepareRequest = () => events.acknowledgeConsumedMessages();
  agent.transformContext = (transcript, abortSignal) =>
    context.transform(transcript, abortSignal);
  agent.beforeToolCall = async () =>
    steps >= maxToolSteps
      ? { block: true, reason: TOOL_LIMIT_NOTICE }
      : undefined;
  agent.finishTurn = ({ toolResults }) => {
    if (toolResults.length) steps++;
    // A model that keeps calling after its calls were refused is stopped.
    if (steps > maxToolSteps + 1) return { action: "end" };
  };
  agent.prepareNextTurnWithContext = ({ context: next }) => {
    // Loaded deferred tools are appended; nothing is ever removed mid-run.
    const nextTools = tools();
    agent.state.tools = nextTools;
    return { context: { ...next, tools: nextTools } };
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
  const meter = createUsageMeter();
  const recordUsage = (usage: Usage) =>
    post({ type: "metrics", metrics: meter.record(usage) });
  const openParts = new Map<string, string>();
  const announcedCalls = new Set<string>();
  const consumed: QueuedUserMessage[] = [];
  const chunk = (value: Record<string, unknown>) =>
    post({ type: "chunk", chunk: value });
  return {
    get messageId() {
      return assistantId;
    },
    recordUsage,
    acknowledgeConsumedMessages() {
      if (!consumed.length) return;
      const createdAt = Date.now();
      const batch = consumed.splice(0);
      assistantId = crypto.randomUUID();
      meter.reset();
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
        recordUsage(event.message.usage);
      }
    },
  };
}

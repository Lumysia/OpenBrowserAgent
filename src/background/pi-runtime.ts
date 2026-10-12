import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core";
import { toToolDeclaration } from "@earendil-works/pi-ai/utils/transcript";
import { TOOL_NAME } from "../shared/tool-names";
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
  type AiStreamResponse,
  type ChatMessage,
  type ChatSource,
  type UploadedAttachment,
} from "../shared/types";
import {
  base64FromDataUrl,
  isVisionImageMimeType,
} from "../shared/attachments";
import { getUploadedAttachments, renderMessageText } from "./message-helpers";
import {
  assistantMessage,
  createProviderStream,
  piModel,
  requestText,
  type ProviderModel,
} from "./pi-provider";
import { indexedDbArtifacts, type ArtifactStore } from "../shared/artifacts";
import { createContextEngine } from "./context/engine";
import { createUsageMeter } from "./run-usage";
import { createToolSet } from "./tools/registry";
import { runTool } from "./tools/run-tool";
import type { RunContext } from "./tools/types";
import {
  isQueuedMessage,
  postToSession,
  type QueuedUserMessage,
  type StreamSession,
} from "./stream-sessions";

// What a run is set up with; the runtime adds what it owns (session,
// artifacts, helper model) to make the tools' RunContext.
export type RunSetup = Omit<
  RunContext,
  "chatId" | "session" | "storeArtifact" | "readArtifact" | "askHelper"
>;

// Declared tools are never removed during a run. Past the step limit, calls
// are answered with this instead of running.
const TOOL_LIMIT_NOTICE =
  "Not executed: the tool step limit for this run is reached. Do not call more tools. Answer now with what you know, say what remains uncertain, and suggest the best next step.";

export async function runPiAgent(options: {
  session: StreamSession;
  model: ProviderModel;
  helperModel: ProviderModel;
  system: string;
  messages: ChatMessage[];
  setup: RunSetup;
  maxToolSteps: number;
  messageId?: string;
  attachmentRetryNotice?: string;
  artifacts?: ArtifactStore;
}) {
  const {
    session,
    model,
    helperModel,
    system,
    messages,
    setup,
    maxToolSteps,
    attachmentRetryNotice,
  } = options;
  const { agent, chatId } = session;
  const signal = session.abortController.signal;
  const post = (message: AiStreamResponse) => postToSession(session, message);
  const events = createEventHandler(post, options.messageId);
  const resolved = piModel(model);
  const stream = createProviderStream(
    model,
    setup.preferences.reasoningEffort,
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
  const askHelper = async (
    helperSystem: string,
    prompt: string,
    abortSignal?: AbortSignal,
  ) => {
    const result = await requestText(
      helperModel,
      { system: helperSystem, prompt },
      abortSignal,
    );
    events.recordUsage(result.usage);
    return result.text;
  };
  const store = options.artifacts || indexedDbArtifacts;
  const run: RunContext = {
    ...setup,
    chatId,
    session,
    askHelper,
    storeArtifact: (label, text) => context.storeText(label, text),
    readArtifact: (handle) => store.get(chatId, handle),
  };
  const toolSet = createToolSet(run, loadedTools(messages));
  const context = createContextEngine({
    chatId,
    store,
    contextWindow: model.contextLength,
    summarize: askHelper,
    compactArgs: (name) => !!toolSet.find(name)?.compactArgs,
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
  // Read and written synchronously around each tool's await, so parallel
  // calls never assign the same source id twice.
  const sources = { current: getMessageSources(messages) };
  let steps = 0;
  const tools = (): AgentTool[] =>
    maxToolSteps <= 0
      ? []
      : toolSet.declared().map((tool) => ({
          name: tool.name,
          label: tool.name,
          description: tool.description,
          parameters: tool.parameters as AgentTool["parameters"],
          executionMode:
            tool.readOnly || tool.parallel ? "parallel" : "sequential",
          async execute(toolCallId, params, toolSignal) {
            const input = (params || {}) as Record<string, unknown>;
            const postPart = (
              state: (typeof CHAT_PART_STATE)[keyof typeof CHAT_PART_STATE],
              output?: Record<string, unknown>,
            ) =>
              post({
                type: "chunk",
                chunk: {
                  type: toolPartType(tool.name),
                  toolCallId,
                  toolName: tool.name,
                  state,
                  input,
                  output,
                },
              });
            postPart(CHAT_PART_STATE.inputAvailable);
            const outcome = await runTool(
              tool,
              input,
              {
                run,
                toolCallId,
                messageId: events.messageId,
                signal: toolSignal,
                progress: (details) =>
                  postPart(CHAT_PART_STATE.inputAvailable, details),
              },
              sources,
            );
            toolSignal?.throwIfAborted();
            postPart(
              outcome.isError
                ? CHAT_PART_STATE.outputError
                : CHAT_PART_STATE.outputAvailable,
              outcome.output,
            );
            const text = await context.acceptToolOutput({
              toolCallId,
              toolName: tool.name,
              input,
              text: outcome.text,
              repeatable:
                !!tool.readOnly &&
                !outcome.isError &&
                tool.name !== TOOL_NAME.read,
            });
            const image = outcome.image;
            return {
              content: [
                { type: "text" as const, text },
                ...(image ? [imageContent(image.dataUrl, image.type)] : []),
              ],
              details: { output: outcome.output },
              isError: outcome.isError,
            };
          },
        }));
  agent.state.model = resolved;
  agent.state.tools = tools();
  // The prompt declares the tools every run starts with; tools loaded in
  // earlier turns follow as a declaration of their own (see createToolSet).
  agent.state.messages = [
    {
      role: "system",
      content: system,
      ...(maxToolSteps > 0
        ? { toolsAdded: toolSet.base().map(toToolDeclaration) }
        : {}),
      timestamp: Date.now(),
    },
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
    // Loaded on-demand tools are appended; nothing is removed mid-run.
    const nextTools = tools();
    agent.state.tools = nextTools;
    return { context: { ...next, tools: nextTools } };
  };
  const unsubscribe = agent.subscribe((event) => events.handle(event));
  // agent.abort() also aborts the provider request and every tool signal.
  const abort = () => agent.abort();
  signal.addEventListener("abort", abort, { once: true });
  try {
    await agent.prompt(piMessages(resolved, messages, setup.attachments));
    signal.throwIfAborted();
    if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
  } finally {
    signal.removeEventListener("abort", abort);
    unsubscribe();
  }
}

// On-demand tools that toolSearch loaded in earlier turns of the chat.
function loadedTools(messages: ChatMessage[]) {
  return messages.flatMap((message) =>
    (message.parts || []).flatMap((part) => {
      const loaded = (part.output as { loaded?: unknown } | undefined)?.loaded;
      return part.toolName === TOOL_NAME.toolSearch && Array.isArray(loaded)
        ? loaded.map(String)
        : [];
    }),
  );
}

function getMessageSources(messages: ChatMessage[]): ChatSource[] {
  const latest = messages[messages.length - 1];
  return Array.isArray(latest?.metadata?.sources)
    ? (latest.metadata.sources as ChatSource[])
    : [];
}

function piMessages(
  model: Model<Api>,
  messages: ChatMessage[],
  attachments: UploadedAttachment[],
): Message[] {
  return messages.map((message, index): Message => {
    const latest = index === messages.length - 1;
    const text = renderMessageText(message, latest, latest ? attachments : []);
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

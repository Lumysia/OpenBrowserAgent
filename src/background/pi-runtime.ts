import type { AgentTool } from "@earendil-works/pi-agent-core";
import { toToolDeclaration } from "@earendil-works/pi-ai/utils/transcript";
import { TOOL_LIMIT_NOTICE } from "../shared/model-notes";
import { TOOL_NAME } from "../shared/tool-names";
import {
  AI_TEXT_CHUNK_TYPE,
  CHAT_PART_STATE,
  toolPartType,
  type AiStreamResponse,
  type ChatMessage,
  type ChatSource,
  type ToolModelResult,
} from "../shared/types";
import { createEventHandler } from "./pi-events";
import {
  createProviderStream,
  piModel,
  requestText,
  type ProviderModel,
} from "./pi-provider";
import { indexedDbArtifacts, type ArtifactStore } from "../shared/artifacts";
import { createContextEngine } from "./context/engine";
import {
  historyMessages,
  imageContent,
  noteCutReplies,
} from "./context/history";
import { CONTEXT_POLICY, tokenChars } from "./context/policy";
import { createToolSet } from "./tools/registry";
import { runTool } from "./tools/run-tool";
import { toolBudget } from "./tool-budget";
import type { RunContext } from "./tools/types";
import { postToSession, type StreamSession } from "./stream-sessions";

// What a run is set up with; the runtime adds what it owns (session,
// artifacts, helper model) to make the tools' RunContext.
export type RunSetup = Omit<
  RunContext,
  | "chatId"
  | "session"
  | "storeArtifact"
  | "readArtifact"
  | "askHelper"
  | "addUsage"
  | "helperInputChars"
>;

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
      { signal: abortSignal },
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
    addUsage: events.addUsage,
    helperInputChars: tokenChars(
      (helperModel.contextLength || CONTEXT_POLICY.defaultContextWindow) *
        CONTEXT_POLICY.helperInputRatio,
    ),
    storeArtifact: (label, text) => context.storeText(label, text),
    // A sub-agent may read the handles its parent passed on.
    readArtifact: async (handle) =>
      (await store.get(chatId, handle)) ||
      (setup.parentChatId
        ? await store.get(setup.parentChatId, handle)
        : undefined),
  };
  const toolSet = createToolSet(run, loadedTools(messages));
  const context = createContextEngine({
    chatId,
    store,
    contextWindow: model.contextLength,
    summarizerWindow: helperModel.contextLength,
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
    onCompactionFailed: (error) =>
      post({
        type: "chunk",
        chunk: {
          type: AI_TEXT_CHUNK_TYPE.contextSummary,
          id: crypto.randomUUID(),
          error,
        },
      }),
  });
  // Read and written synchronously around each tool's await, so parallel
  // calls never assign the same source id twice.
  const sources = { current: getMessageSources(messages) };
  let steps = 0;
  const budget = toolBudget(maxToolSteps);
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
              result?: ToolModelResult,
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
                  result,
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
            const accepted = await context.acceptToolOutput({
              toolCallId,
              toolName: tool.name,
              input,
              text: outcome.text,
              source: outcome.sources[0],
              bounded: !!tool.boundedOutput,
              repeatable:
                !!tool.readOnly &&
                !outcome.isError &&
                tool.name !== TOOL_NAME.read,
            });
            const { artifact } = accepted;
            // What is left of the run's tool steps, when it gets low.
            const left = budget.note(steps);
            const text = left ? `${accepted.text}\n\n${left}` : accepted.text;
            const image = outcome.image;
            postPart(
              outcome.isError
                ? CHAT_PART_STATE.outputError
                : CHAT_PART_STATE.outputAvailable,
              outcome.output,
              {
                text,
                ...(image ? { image: true } : {}),
                ...(artifact ? { artifact } : {}),
              },
            );
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
  agent.streamFunction = (...args) => {
    events.requestStarted();
    return stream(...args);
  };
  agent.sessionId = chatId;
  // Pi has injected the whole consumed batch here. Publish it before context
  // processing (including compaction requests), even if the provider is slow.
  agent.prepareRequest = () => events.acknowledgeConsumedMessages();
  agent.transformContext = (transcript, abortSignal) =>
    context.transform(noteCutReplies(transcript), abortSignal);
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
    await agent.prompt(
      historyMessages(messages, {
        model: resolved,
        attachments: setup.attachments,
        tools: agent.state.tools.length > 0,
        compactArgs: (name) => !!toolSet.find(name)?.compactArgs,
        skills: setup.skills,
      }),
    );
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

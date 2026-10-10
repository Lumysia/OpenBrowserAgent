import type { Agent, AgentTool } from "@earendil-works/pi-agent-core";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import type {
  AgentCapabilities,
  AgentWorkspace,
  ChatMessage,
  McpServerConfig,
  Skill,
  UploadedAttachment,
} from "../shared/types";
import { storage } from "../shared/storage";
import { post } from "./message-helpers";
import { createPiMessages, imageContent } from "./pi-messages";
import { createPiEventHandler } from "./pi-events";
import { applyPiContextBudget, messageText } from "./pi-context-budget";
import {
  createProviderStream,
  piModel,
  type ProviderModel,
} from "./pi-provider";
import { createToolResolver } from "./provider-tools";
import { runProviderTool } from "./provider-tool-runner";
import {
  getMessageSources,
  latestUserMessageText,
  type ProviderTextResult,
} from "./provider-output";
import { isToolError } from "./tool-utils";
import { postContextBudget } from "./provider-metrics";
import {
  buildCompactionPrompt,
  COMPACTION_SYSTEM_PROMPT,
  renderCompactionContext,
} from "./compaction-prompt";

export async function runPiAgent(options: {
  agent: Agent;
  model: ProviderModel;
  system: string;
  messages: ChatMessage[];
  capabilities: AgentCapabilities;
  maxToolSteps: number;
  signal: AbortSignal;
  port: chrome.runtime.Port;
  chatId?: string;
  messageId?: string;
  attachmentRetryNotice?: string;
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
  mcpServers: McpServerConfig[];
  workspace?: AgentWorkspace;
}): Promise<ProviderTextResult> {
  const {
    agent,
    model,
    system,
    messages,
    capabilities,
    maxToolSteps,
    signal,
    port,
    chatId,
    messageId,
    attachmentRetryNotice,
    uploadedAttachments,
    availableSkills,
    mcpServers,
    workspace,
  } = options;
  signal.throwIfAborted();
  const preferences = await storage.preferences.get();
  signal.throwIfAborted();
  const events = createPiEventHandler(port, messageId);
  const resolved = piModel(model);
  const stream = createProviderStream(
    model,
    preferences.reasoningEffort,
    () => {
      if (!attachmentRetryNotice) return;
      const id = crypto.randomUUID();
      post(port, { type: "chunk", chunk: { type: "text-start", id } });
      post(port, {
        type: "chunk",
        chunk: {
          type: "text-delta",
          id,
          delta: `${attachmentRetryNotice}\n\n`,
        },
      });
      post(port, { type: "chunk", chunk: { type: "text-end", id } });
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
            toolSignal?.throwIfAborted();
            const result = await runProviderTool({
              toolName: tool.function.name,
              toolCallId,
              input: input as Record<string, unknown>,
              port,
              chatId,
              messageId: events.messageId,
              uploadedAttachments,
              availableSkills,
              preferences,
              capabilities,
              workspace,
              responseSources: sources,
              loadedToolNames: resolver.loadedToolNames,
              availableTools: resolver.availableTools(),
              signal: toolSignal,
            });
            sources = result.responseSources;
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result.modelOutput) ?? "null",
                },
                ...(result.visionImage
                  ? [
                      imageContent(
                        result.visionImage.dataUrl,
                        result.visionImage.type,
                      ),
                    ]
                  : []),
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
      // Summarization is a single provider request, never an auxiliary agent loop.
      // Failure leaves the normal pruning placeholder and original transcript intact.
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
    postContextBudget((message) => post(port, message), budget.report);
    return budget.messages;
  };
  agent.finishTurn = ({ toolResults }) => {
    if (toolResults.length) steps++;
    // Bound a non-compliant model that still returns calls after tools are removed.
    if (steps > maxToolSteps) return { action: "end" };
  };
  agent.prepareNextTurnWithContext = ({ context }) => {
    const nextTools = tools();
    agent.state.tools = nextTools;
    const messages =
      steps >= maxToolSteps && maxToolSteps > 0 && !limitAnnounced
        ? [
            {
              role: "user" as const,
              timestamp: Date.now(),
              content:
                "<internal_instruction>Maximum browser tool steps reached. Do not call more tools. Summarize the findings and clearly state what is known, what remains uncertain, and the best next step for the user. Respond in the same language as the user's latest non-internal message.</internal_instruction>",
            },
          ]
        : [];
    if (messages.length) limitAnnounced = true;
    return { context: { ...context, tools: nextTools }, messages };
  };
  const unsubscribe = agent.subscribe((event) => events.handle(event));
  const abort = () => agent.abort();
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    await agent.prompt(
      createPiMessages(
        resolved,
        messages,
        uploadedAttachments,
        availableSkills,
        workspace,
      ),
    );
    signal.throwIfAborted();
    if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
    return { text: "", outputMode: "streaming", usage: events.usage };
  } finally {
    signal.removeEventListener("abort", abort);
    unsubscribe();
  }
}

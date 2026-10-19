import type { ToolGroup } from "../../shared/agents";
import type {
  Agent,
  AgentWorkspace,
  ChatSource,
  McpServerConfig,
  Preferences,
  ProviderState,
  Skill,
  UploadedAttachment,
} from "../../shared/types";
import type { RunTab } from "../run-tab";
import type { UsageMetrics } from "../run-usage";
import type { StreamSession } from "../stream-sessions";

type VisionImage = { dataUrl: string; type?: string };

export type SourceInput = Omit<ChatSource, "id" | "createdAt">;

// What a tool returns. `text` is all the model sees; `details` is what the
// side panel shows; `sources` become citable sources of the chat.
export type ToolResult = {
  text: string;
  details?: Record<string, unknown>;
  sources?: SourceInput[];
  image?: VisionImage;
  isError?: boolean;
};

// A run nobody watches: a scheduled task or a watch. `readOnly`: it may
// only use tools that look (see ToolEffects); set unless its agent may act
// on its own. `needsUser` records a question nobody is there to answer.
export type UnattendedRun = {
  readOnly: boolean;
  needsUser(question: string): void;
  // The task's own run (not its sub-agents') reports its outcome.
  report?(outcome: TaskOutcome): void;
};

export type TaskOutcome = {
  outcome: "report" | "nothing" | "met" | "notMet";
  summary: string;
};

// Everything a run knows that tools may need. Built once per run.
export type RunContext = {
  chatId: string;
  agent: Agent;
  skills: Skill[];
  workspace?: AgentWorkspace;
  attachments: UploadedAttachment[];
  mcpServers: McpServerConfig[];
  preferences: Preferences;
  providers: ProviderState;
  session: StreamSession;
  // Sub-agent depth: a sub-agent cannot start another one.
  depth: number;
  // The chat that started this sub-agent run.
  parentChatId?: string;
  // The tab page tools work on when a call names none.
  tab: RunTab;
  // Set for scheduled task and watch runs.
  unattended?: UnattendedRun;
  storeArtifact(label: string, text: string): Promise<string>;
  readArtifact(
    handle: string,
  ): Promise<{ label: string; text: string } | undefined>;
  // Runs `cleanup` when the run ends, however it ends (for what a tool
  // keeps going only while its run lasts, such as a capture).
  onEnd(cleanup: () => unknown): void;
  // Adds the usage of a run made for this one (a sub-agent's).
  addUsage(metrics: UsageMetrics): void;
  // How much text one helper request may carry.
  helperInputChars: number;
  // One plain-text request to the helper model.
  askHelper(
    system: string,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<string>;
};

// What decides which tools a run gets (createToolSet), so the tools can be
// listed without a running chat.
export type ToolSetup = Pick<
  RunContext,
  | "agent"
  | "mcpServers"
  | "preferences"
  | "providers"
  | "depth"
  | "workspace"
  | "unattended"
>;

// The chat a run's tabs and downloads belong to: a sub-agent's are its
// parent chat's.
export function ownerChat(run: Pick<RunContext, "chatId" | "parentChatId">) {
  return run.parentChatId || run.chatId;
}

export type ToolContext = {
  run: RunContext;
  toolCallId: string;
  messageId?: string;
  signal?: AbortSignal;
  // Updates the tool's part in the side panel while it runs.
  progress(details: Record<string, unknown>): void;
};

type JsonSchema = Record<string, unknown>;

// What a call does beyond the run. "read" only looks: reads pages and files,
// searches, captures, computes, opens a background tab of its own. "act"
// changes something: clicks or types on a page, edits it, navigates or
// closes a tab, downloads, writes stored data, runs local commands, or
// calls a service with effects. Unattended read-only runs get only "read".
export const TOOL_EFFECT = { read: "read", act: "act" } as const;
export type ToolEffect = (typeof TOOL_EFFECT)[keyof typeof TOOL_EFFECT];

// One effect for the tool; one per value of its `action` parameter
// (actions not listed act); or `byRun`: the tool reads, and what else it
// can change (runCode's saved files) it changes only in runs that may act
// (see mayChange). A read-only run gets it with `readOnlyNote` added to its
// description.
export type ToolEffects =
  | ToolEffect
  | { byAction: Record<string, ToolEffect> }
  | { byRun: { readOnlyNote: string } };

// Whether this run may change anything beyond itself: false in unattended
// runs whose agent may not act on its own.
export function mayChange(run: Pick<RunContext, "unattended">) {
  return !run.unattended?.readOnly;
}

export type ToolDefinition = {
  name: string;
  // Tools without a group are available to every agent.
  group?: ToolGroup;
  // On-demand tools are declared only after toolSearch loads them.
  onDemand?: boolean;
  // One line for the toolSearch index.
  summary: string;
  description: string;
  parameters: JsonSchema;
  // What its calls change (see ToolEffects); every tool declares it.
  effects: ToolEffects;
  // Read-only calls run in parallel and an identical repeat is answered
  // with a reference to the earlier output.
  readOnly?: boolean;
  // The tool bounds its own output (read returns ranges and says where to
  // continue), so the general output cap does not cut it again.
  boundedOutput?: boolean;
  // Runs in parallel with other parallel calls without being read-only.
  parallel?: boolean;
  // Long arguments (such as translated text) shrink once the call is old.
  compactArgs?: boolean;
  // Overrides the default time limit of page tools.
  timeoutMs?: number;
  available?(setup: ToolSetup): boolean;
  execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult>;
};

export function ok(
  text: string,
  details?: Record<string, unknown>,
): ToolResult {
  return { text, details };
}

export function fail(
  text: string,
  details?: Record<string, unknown>,
): ToolResult {
  return { text, details: { ...details, error: text }, isError: true };
}

// Structured results of management tools, shown and read as compact JSON.
export function json(value: Record<string, unknown>): ToolResult {
  const error = typeof value.error === "string" ? value.error : undefined;
  return {
    text: JSON.stringify(value),
    details: value,
    isError: !!error || value.success === false,
  };
}

export function schema(
  properties: Record<string, unknown>,
  required: string[] = [],
): JsonSchema {
  return { type: "object", properties, required };
}

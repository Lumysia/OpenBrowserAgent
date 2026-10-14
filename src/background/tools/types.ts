import type { ToolGroup } from "../../shared/agents";
import type {
  Agent,
  AgentWorkspace,
  ChatSource,
  McpServerConfig,
  Preferences,
  Skill,
  UploadedAttachment,
} from "../../shared/types";
import type { RunTab } from "../run-tab";
import type { UsageMetrics } from "../run-usage";
import type { StreamSession } from "../stream-sessions";

export type VisionImage = { dataUrl: string; type?: string };

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

// Everything a run knows that tools may need. Built once per run.
export type RunContext = {
  chatId: string;
  agent: Agent;
  skills: Skill[];
  workspace?: AgentWorkspace;
  attachments: UploadedAttachment[];
  mcpServers: McpServerConfig[];
  preferences: Preferences;
  session: StreamSession;
  // Sub-agent depth: a sub-agent cannot start another one.
  depth: number;
  // The chat that started this sub-agent run.
  parentChatId?: string;
  // The tab page tools work on when a call names none.
  tab: RunTab;
  storeArtifact(label: string, text: string): Promise<string>;
  readArtifact(
    handle: string,
  ): Promise<{ label: string; text: string } | undefined>;
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

export type ToolContext = {
  run: RunContext;
  toolCallId: string;
  messageId?: string;
  signal?: AbortSignal;
  // Updates the tool's part in the side panel while it runs.
  progress(details: Record<string, unknown>): void;
};

export type JsonSchema = Record<string, unknown>;

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
  available?(run: RunContext): boolean;
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

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function stringArg(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

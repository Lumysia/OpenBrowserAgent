import { isBuiltinAgentId } from "./agents";
import type { ChatSummary } from "./chat-types";
import type { McpServerConfig } from "./mcp";
import type { Agent, ProviderState, Skill } from "./types";

// What a returning user's setup shows once sync downloaded: how many of
// each kind of thing there is, in this order.
export const SYNCED_DATA_KINDS = [
  "providers",
  "agents",
  "skills",
  "mcpServers",
  "chats",
] as const;

export type SyncedDataKind = (typeof SYNCED_DATA_KINDS)[number];

export type SyncedData = {
  providers?: ProviderState;
  agents?: Agent[];
  skills?: Skill[];
  mcpServers?: McpServerConfig[];
  chats?: ChatSummary[];
};

const COUNT: Record<SyncedDataKind, (data: SyncedData) => number> = {
  providers: (data) => Object.keys(data.providers ?? {}).length,
  // The built-in agents are on every device.
  agents: (data) =>
    (data.agents ?? []).filter((agent) => !isBuiltinAgentId(agent.id)).length,
  skills: (data) => data.skills?.length ?? 0,
  mcpServers: (data) => data.mcpServers?.length ?? 0,
  chats: (data) => data.chats?.length ?? 0,
};

// The kinds there are any of, with their counts.
export function syncedDataCounts(data: SyncedData) {
  return SYNCED_DATA_KINDS.map((kind) => ({
    kind,
    count: COUNT[kind](data),
  })).filter(({ count }) => count > 0);
}

// Sync brought no AI provider: chat would have nothing to use.
export function syncBroughtNoProvider(data: SyncedData) {
  return COUNT.providers(data) === 0;
}

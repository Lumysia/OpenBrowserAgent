import { DEFAULT_AGENT_ICON_ID } from "./agent-icon-registry";
import type { Agent, AgentCapabilities } from "./types";

export const DEFAULT_AGENT_ID = "general-agent";
export const ASK_AGENT_ID = "ask-agent";
export const AGENT_CAPABILITIES: AgentCapabilities = {
  browserAutomation: true,
  browserTools: true,
  subAgents: true,
  localExecutionBridges: true,
  deferredBrowserTools: true,
  cdpTools: true,
  javascriptExecution: false,
  mcpTools: true,
  mcpManagement: true,
  skillTools: true,
  skillCreation: true,
  workspaceRead: true,
  workspaceWrite: true,
  memoryRead: true,
  memoryWrite: true,
  chatHistoryRead: true,
  chatHistoryWrite: true,
  imageGeneration: true,
  currentTime: true,
  fileUrlRead: true,
};

export const ASK_AGENT_CAPABILITIES: AgentCapabilities = {
  browserAutomation: false,
  browserTools: true,
  subAgents: false,
  localExecutionBridges: false,
  deferredBrowserTools: false,
  cdpTools: false,
  javascriptExecution: false,
  mcpTools: false,
  mcpManagement: false,
  skillTools: true,
  skillCreation: false,
  workspaceRead: false,
  workspaceWrite: false,
  memoryRead: false,
  memoryWrite: false,
  chatHistoryRead: false,
  chatHistoryWrite: false,
  imageGeneration: true,
  currentTime: true,
  fileUrlRead: true,
};

export const BROWSE_AGENT_CAPABILITIES: AgentCapabilities = {
  ...AGENT_CAPABILITIES,
  workspaceRead: false,
  workspaceWrite: false,
  memoryRead: false,
  memoryWrite: false,
  chatHistoryRead: false,
  chatHistoryWrite: false,
};

export const CUSTOM_AGENT_CAPABILITIES: AgentCapabilities = {
  ...AGENT_CAPABILITIES,
};

export const DEFAULT_AGENT: Agent = {
  id: DEFAULT_AGENT_ID,
  name: "Browse",
  description: "",
  icon: "compass",
  capabilities: BROWSE_AGENT_CAPABILITIES,
  builtin: true,
  createdAt: 0,
  updatedAt: 0,
};

export const ASK_AGENT: Agent = {
  id: ASK_AGENT_ID,
  name: "Ask",
  description: "Ask questions about web pages",
  icon: "help",
  capabilities: ASK_AGENT_CAPABILITIES,
  builtin: true,
  createdAt: 0,
  updatedAt: 0,
};

export const BUILTIN_AGENTS = [DEFAULT_AGENT, ASK_AGENT];

export const AGENT_CAPABILITY_KEYS: Array<keyof AgentCapabilities> = [
  "browserAutomation",
  "browserTools",
  "subAgents",
  "localExecutionBridges",
  "deferredBrowserTools",
  "cdpTools",
  "javascriptExecution",
  "mcpTools",
  "mcpManagement",
  "skillTools",
  "skillCreation",
  "workspaceRead",
  "workspaceWrite",
  "memoryRead",
  "memoryWrite",
  "chatHistoryRead",
  "chatHistoryWrite",
  "imageGeneration",
  "currentTime",
  "fileUrlRead",
];

export const AGENT_CAPABILITY_GROUPS = [
  {
    key: "browser",
    capabilities: [
      "browserAutomation",
      "deferredBrowserTools",
      "cdpTools",
      "javascriptExecution",
    ],
  },
  {
    key: "builtinTools",
    capabilities: [
      "browserTools",
      "subAgents",
      "localExecutionBridges",
      "currentTime",
      "fileUrlRead",
      "imageGeneration",
    ],
  },
  {
    key: "skillsAndMcp",
    capabilities: ["skillTools", "skillCreation", "mcpTools", "mcpManagement"],
  },
  {
    key: "workspaceAndMemory",
    capabilities: [
      "workspaceRead",
      "workspaceWrite",
      "memoryRead",
      "memoryWrite",
    ],
  },
  {
    key: "chatHistory",
    capabilities: ["chatHistoryRead", "chatHistoryWrite"],
  },
] as const satisfies ReadonlyArray<{
  key:
    | "browser"
    | "builtinTools"
    | "skillsAndMcp"
    | "workspaceAndMemory"
    | "chatHistory";
  capabilities: Array<keyof AgentCapabilities>;
}>;

export function normalizeAgents(value: Agent[] | undefined) {
  const now = Date.now();
  const agents = Array.isArray(value) ? value.filter(isAgentLike) : [];
  const normalized = agents.map((agent) => ({
    ...agent,
    capabilities: { ...CUSTOM_AGENT_CAPABILITIES, ...agent.capabilities },
    name: normalizeAgentName(agent),
    createdAt: agent.createdAt || now,
    updatedAt: agent.updatedAt || agent.createdAt || now,
  }));
  const existingIds = new Set(normalized.map((agent) => agent.id));
  return [
    ...BUILTIN_AGENTS.filter((agent) => !existingIds.has(agent.id)).map(
      (agent) => withBuiltinTimestamps(agent, now),
    ),
    ...normalized.map((agent) =>
      isBuiltinAgentId(agent.id)
        ? {
            ...builtinAgent(agent.id),
            createdAt: agent.createdAt,
            updatedAt: agent.updatedAt,
          }
        : agent,
    ),
  ];
}

export function createAgentDraft(name: string): Agent {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    description: "",
    icon: DEFAULT_AGENT_ICON_ID,
    capabilities: CUSTOM_AGENT_CAPABILITIES,
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveAgent(agents: Agent[] | undefined, agentId?: string) {
  const normalized = normalizeAgents(agents);
  return (
    normalized.find((agent) => agent.id === agentId) ||
    normalized.find((agent) => agent.id === DEFAULT_AGENT_ID) ||
    normalized[0]
  );
}

export function isBuiltinAgentId(agentId: string) {
  return BUILTIN_AGENTS.some((agent) => agent.id === agentId);
}

export function usesWorkspaceCapabilities(capabilities: AgentCapabilities) {
  return (
    capabilities.workspaceRead ||
    capabilities.workspaceWrite ||
    capabilities.memoryRead ||
    capabilities.memoryWrite
  );
}

function withBuiltinTimestamps(agent: Agent, now: number): Agent {
  return { ...agent, createdAt: now, updatedAt: now };
}

function builtinAgent(agentId: string) {
  return BUILTIN_AGENTS.find((agent) => agent.id === agentId) || DEFAULT_AGENT;
}

function isAgentLike(value: Agent | undefined): value is Agent {
  return (
    !!value?.id &&
    typeof value.name === "string" &&
    isAgentCapabilities(value.capabilities)
  );
}

function isAgentCapabilities(
  value: AgentCapabilities | undefined,
): value is AgentCapabilities {
  return (
    !!value &&
    AGENT_CAPABILITY_KEYS.every(
      (key) => value[key] === undefined || typeof value[key] === "boolean",
    )
  );
}

function normalizeAgentName(agent: Agent) {
  if (agent.id === DEFAULT_AGENT_ID && agent.name === "OpenBrowserAgent")
    return DEFAULT_AGENT.name;
  if (agent.id === ASK_AGENT_ID) return ASK_AGENT.name;
  if (agent.id === DEFAULT_AGENT_ID) return DEFAULT_AGENT.name;
  return agent.name.trim() || DEFAULT_AGENT.name;
}

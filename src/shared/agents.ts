import { DEFAULT_AGENT_ICON_ID } from "./agent-icon-registry";
import type { Agent } from "./types";

// What an agent may use. Each tool belongs to one group (or to none when
// every agent needs it); an agent lists the groups it gets.
export const TOOL_GROUPS = [
  "pages",
  "browser",
  "web",
  "images",
  "skills",
  "workspace",
  "history",
  "subAgents",
  "mcp",
  "localExecution",
  "scripts",
  "devtools",
] as const;

export type ToolGroup = (typeof TOOL_GROUPS)[number];

// Groups that need the Chrome debugger; hidden where it does not exist.
export const DEBUGGER_TOOL_GROUPS: ToolGroup[] = ["scripts", "devtools"];

export const DEFAULT_AGENT_ID = "general-agent";
export const ASK_AGENT_ID = "ask-agent";

export const DEFAULT_AGENT: Agent = {
  id: DEFAULT_AGENT_ID,
  name: "Browse",
  description: "",
  icon: "compass",
  prompt: "",
  toolGroups: [
    "pages",
    "browser",
    "web",
    "images",
    "skills",
    "subAgents",
    "mcp",
    "localExecution",
    "devtools",
  ],
  workspace: false,
  builtin: true,
  createdAt: 0,
  updatedAt: 0,
};

export const ASK_AGENT: Agent = {
  id: ASK_AGENT_ID,
  name: "Ask",
  description: "Ask questions about web pages",
  icon: "help",
  prompt:
    "Answer questions about the pages, files and text the user shares. Read pages, but do not operate the browser or change pages.",
  toolGroups: ["pages", "web", "images", "skills"],
  workspace: false,
  builtin: true,
  createdAt: 0,
  updatedAt: 0,
};

export const BUILTIN_AGENTS = [DEFAULT_AGENT, ASK_AGENT];

const CUSTOM_AGENT_TOOL_GROUPS = TOOL_GROUPS.filter(
  (group) => group !== "scripts",
);

export function createAgentDraft(name: string): Agent {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    description: "",
    icon: DEFAULT_AGENT_ICON_ID,
    prompt: "",
    toolGroups: [...CUSTOM_AGENT_TOOL_GROUPS],
    workspace: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeAgents(value: Agent[] | undefined) {
  const now = Date.now();
  const agents = Array.isArray(value)
    ? value.filter((agent) => !!agent?.id && typeof agent.name === "string")
    : [];
  const existingIds = new Set(agents.map((agent) => agent.id));
  return [
    ...BUILTIN_AGENTS.filter((agent) => !existingIds.has(agent.id)).map(
      (agent) => ({ ...agent, createdAt: now, updatedAt: now }),
    ),
    ...agents.map((agent) => {
      const builtin = BUILTIN_AGENTS.find((item) => item.id === agent.id);
      if (builtin)
        return {
          ...builtin,
          createdAt: agent.createdAt || now,
          updatedAt: agent.updatedAt || now,
        };
      return normalizeAgent(agent, now);
    }),
  ];
}

function normalizeAgent(agent: Agent, now: number): Agent {
  return {
    ...agent,
    name: agent.name.trim() || DEFAULT_AGENT.name,
    prompt: typeof agent.prompt === "string" ? agent.prompt : "",
    toolGroups: Array.isArray(agent.toolGroups)
      ? TOOL_GROUPS.filter((group) => agent.toolGroups.includes(group))
      : [...CUSTOM_AGENT_TOOL_GROUPS],
    modelId: agent.modelId || undefined,
    workspace: agent.workspace !== false,
    createdAt: agent.createdAt || now,
    updatedAt: agent.updatedAt || agent.createdAt || now,
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

export function hasToolGroup(agent: Agent, group: ToolGroup) {
  return agent.toolGroups.includes(group);
}

import type { Agent } from "./types";

export const DEFAULT_AGENT_ID = "general-agent";

export const DEFAULT_AGENT: Agent = {
  id: DEFAULT_AGENT_ID,
  name: "Agent",
  description: "",
  builtin: true,
  createdAt: 0,
  updatedAt: 0,
};

export function normalizeAgents(value: Agent[] | undefined) {
  const now = Date.now();
  const agents = Array.isArray(value) ? value.filter(isAgentLike) : [];
  const normalized = agents.map((agent) => ({
    ...agent,
    name: normalizeAgentName(agent),
    createdAt: agent.createdAt || now,
    updatedAt: agent.updatedAt || agent.createdAt || now,
  }));
  if (!normalized.some((agent) => agent.id === DEFAULT_AGENT_ID))
    return [withDefaultTimestamps(now), ...normalized];
  return normalized;
}

export function createAgentDraft(name: string): Agent {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    description: "",
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

function withDefaultTimestamps(now: number): Agent {
  return { ...DEFAULT_AGENT, createdAt: now, updatedAt: now };
}

function isAgentLike(value: Agent | undefined): value is Agent {
  return !!value?.id && typeof value.name === "string";
}

function normalizeAgentName(agent: Agent) {
  if (agent.id === DEFAULT_AGENT_ID && agent.name === "OpenBrowserAgent")
    return DEFAULT_AGENT.name;
  return agent.name.trim() || DEFAULT_AGENT.name;
}

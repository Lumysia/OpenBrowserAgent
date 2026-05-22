import type { Agent, AgentCapabilities, Chat } from "../../src/shared/types";

export function withoutNestedSubAgents(
  capabilities: AgentCapabilities,
): AgentCapabilities {
  return capabilities.subAgents
    ? { ...capabilities, subAgents: false }
    : capabilities;
}

export function agentWithoutNestedSubAgents(agent: Agent): Agent {
  const capabilities = withoutNestedSubAgents(agent.capabilities);
  return capabilities === agent.capabilities
    ? agent
    : { ...agent, capabilities };
}

export function agentForChatRuntime(agent: Agent, chat: Chat | undefined) {
  return chat?.kind === "subagent" ? agentWithoutNestedSubAgents(agent) : agent;
}

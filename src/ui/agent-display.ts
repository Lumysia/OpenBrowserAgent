import { ASK_AGENT_ID, DEFAULT_AGENT_ID } from "../shared/agents";
import type { Messages } from "../shared/i18n";
import type { Agent } from "../shared/types";

export function agentDisplayName(agent: Agent, t: Messages) {
  if (agent.id === ASK_AGENT_ID) return t.words.ask;
  return agent.id === DEFAULT_AGENT_ID ? t.words.agent : agent.name;
}

export function agentDisplayDescription(agent: Agent, t: Messages) {
  if (agent.id === ASK_AGENT_ID) return t.sidepanel.askDescription;
  return agent.description || t.options.defaultAgentSummary;
}

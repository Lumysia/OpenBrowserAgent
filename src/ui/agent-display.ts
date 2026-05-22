import {
  ASK_AGENT,
  ASK_AGENT_ID,
  DEFAULT_AGENT,
  DEFAULT_AGENT_ID,
} from "../shared/agents";
import type { Messages } from "../shared/i18n";
import type { Agent, Chat } from "../shared/types";

export function agentDisplayName(agent: Agent, t: Messages) {
  return agentDisplayNameById(agent.id, agent.name, t);
}

export function agentDisplayNameById(
  agentId: string | undefined,
  fallbackName: string | undefined,
  t: Messages,
) {
  if (agentId === ASK_AGENT_ID || fallbackName === ASK_AGENT.name)
    return t.words.ask;
  return agentId === DEFAULT_AGENT_ID || fallbackName === DEFAULT_AGENT.name
    ? t.words.agent
    : fallbackName || "";
}

export function localizedAgentTitle({
  title,
  agentId,
  agentName,
  fallback,
  t,
}: {
  title: string | undefined;
  agentId: string | undefined;
  agentName: string | undefined;
  fallback: string;
  t: Messages;
}) {
  const displayName = agentDisplayNameById(agentId, agentName, t);
  const rawTitle = (title || fallback).trim();
  const rawPrefix = [displayName, agentName, ASK_AGENT.name, DEFAULT_AGENT.name]
    .filter(Boolean)
    .map((name) => `${name}:`)
    .find((prefix) => rawTitle.startsWith(prefix));
  const body = rawPrefix ? rawTitle.slice(rawPrefix.length).trim() : rawTitle;
  return displayName && body ? `${displayName}: ${body}` : body || displayName;
}

export function chatDisplayTitle(chat: Chat | undefined, t: Messages) {
  if (!chat) return t.words.newChat;
  if (chat.kind !== "subagent") return chat.title || t.words.newChat;
  return localizedAgentTitle({
    title: chat.title,
    agentId: chat.agentId,
    agentName: undefined,
    fallback: t.sidepanel.subAgentChat,
    t,
  });
}

export function agentDisplayDescription(agent: Agent, t: Messages) {
  if (agent.id === ASK_AGENT_ID) return t.sidepanel.askDescription;
  return agent.description || t.options.defaultAgentSummary;
}

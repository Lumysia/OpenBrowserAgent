export const AGENT_ICON_IDS = [
  "bot",
  "compass",
  "search",
  "help",
  "languages",
  "sparkles",
  "globe",
  "bookOpen",
  "wrench",
  "fileText",
] as const;

export type AgentIconId = (typeof AGENT_ICON_IDS)[number];

export const DEFAULT_AGENT_ICON_ID: AgentIconId = "bot";

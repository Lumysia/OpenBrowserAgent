import {
  DEFAULT_CONTEXT_BUDGET_PREFERENCES,
  DEFAULT_MAX_TOOL_STEPS,
} from "./config";
import type { Preferences } from "./types";
import { REASONING_EFFORT } from "./reasoning";

export const DEFAULT_PREFERENCES: Preferences = {
  colorScheme: "system",
  accentColor: "pink",
  autoScroll: true,
  autoRetry: true,
  imageGenerationEnabled: false,
  imageGenerationSize: "1024x1024",
  maxToolSteps: DEFAULT_MAX_TOOL_STEPS,
  reasoningEffort: REASONING_EFFORT.default,
  ...DEFAULT_CONTEXT_BUDGET_PREFERENCES,
};

export function mergePreferences(
  value: Preferences & Record<string, unknown>,
): Preferences {
  const {
    syncSettings,
    syncProviders,
    syncAgents,
    syncSkills,
    syncMcpServers,
    syncChats,
    syncChatAttachments,
    ...preferences
  } = value;
  return {
    ...DEFAULT_PREFERENCES,
    ...preferences,
  };
}

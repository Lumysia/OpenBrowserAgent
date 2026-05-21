import {
  DEFAULT_CONTEXT_BUDGET_PREFERENCES,
  DEFAULT_MAX_TOOL_STEPS,
} from "./config";
import type { Preferences } from "./types";
import { REASONING_EFFORT } from "./reasoning";

export const DEFAULT_PREFERENCES: Preferences = {
  colorScheme: "system",
  accentColor: "pink",
  syncSettings: true,
  syncProviders: true,
  syncAgents: false,
  syncSkills: false,
  syncMcpServers: false,
  syncChats: false,
  autoScroll: true,
  autoRetry: true,
  imageGenerationEnabled: false,
  imageGenerationSize: "1024x1024",
  maxToolSteps: DEFAULT_MAX_TOOL_STEPS,
  reasoningEffort: REASONING_EFFORT.default,
  ...DEFAULT_CONTEXT_BUDGET_PREFERENCES,
};

export function mergePreferences(value: Preferences): Preferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...value,
    syncSettings: true,
    syncProviders: true,
  };
}

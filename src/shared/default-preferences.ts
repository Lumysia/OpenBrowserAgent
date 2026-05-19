import {
  DEFAULT_CONTEXT_BUDGET_PREFERENCES,
  DEFAULT_MAX_TOOL_STEPS,
} from "./config";
import type { Preferences } from "./types";

export const DEFAULT_PREFERENCES: Preferences = {
  colorScheme: "system",
  accentColor: "pink",
  syncSettings: true,
  syncProviders: true,
  syncAgents: false,
  syncSkills: false,
  syncChats: false,
  autoSelectSkills: true,
  autoScroll: true,
  autoRetry: true,
  cdpToolsEnabled: false,
  dangerousCodeExecutionEnabled: false,
  imageGenerationEnabled: false,
  imageGenerationSize: "1024x1024",
  maxToolSteps: DEFAULT_MAX_TOOL_STEPS,
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

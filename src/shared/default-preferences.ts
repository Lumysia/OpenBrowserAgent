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
  syncSkills: false,
  syncChats: false,
  autoSelectSkills: false,
  autoScroll: true,
  autoRetry: true,
  cdpToolsEnabled: false,
  imageGenerationEnabled: false,
  imageGenerationSize: "1024x1024",
  maxToolSteps: DEFAULT_MAX_TOOL_STEPS,
  ...DEFAULT_CONTEXT_BUDGET_PREFERENCES,
};

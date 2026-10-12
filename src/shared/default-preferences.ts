import { DEFAULT_MAX_TOOL_STEPS } from "./config";
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
  // Empty: auxiliary requests use the chat's own model.
  helperModelId: "",
};

export function mergePreferences(value: Partial<Preferences>): Preferences {
  return { ...DEFAULT_PREFERENCES, ...value };
}

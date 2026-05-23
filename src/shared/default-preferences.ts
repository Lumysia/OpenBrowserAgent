import {
  DEFAULT_CONTEXT_BUDGET_PREFERENCES,
  DEFAULT_MAX_TOOL_STEPS,
} from "./config";
import type { Preferences } from "./types";
import { REASONING_EFFORT } from "./reasoning";
import { SYNC_DATA_SETTING_KEYS } from "./sync-data-settings";
import { SYNC_PREFERENCES } from "./storage-keys";

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

const LEGACY_SYNC_PREFERENCE_KEYS = [
  "syncSettings",
  ...Object.values(SYNC_PREFERENCES),
  SYNC_DATA_SETTING_KEYS.chatAttachments,
] as const;

export function mergePreferences(
  value: Preferences & Record<string, unknown>,
): Preferences {
  const preferences = { ...value };
  for (const key of LEGACY_SYNC_PREFERENCE_KEYS) delete preferences[key];
  return {
    ...DEFAULT_PREFERENCES,
    ...preferences,
  };
}

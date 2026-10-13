import { DEFAULT_MAX_TOOL_STEPS } from "./config";
import type { Preferences } from "./types";
import { REASONING_EFFORT } from "./reasoning";
import { DEFAULT_COLOR_SCHEME, DEFAULT_THEME } from "./theme/themes";
import {
  DEFAULT_SMART_BAR_SETTINGS,
  normalizeSmartBarSettings,
} from "./smart-bar";

export const DEFAULT_PREFERENCES: Preferences = {
  colorScheme: DEFAULT_COLOR_SCHEME,
  accentColor: DEFAULT_THEME,
  autoScroll: true,
  holidayTouches: true,
  autoRetry: true,
  imageGenerationEnabled: false,
  imageGenerationSize: "1024x1024",
  maxToolSteps: DEFAULT_MAX_TOOL_STEPS,
  reasoningEffort: REASONING_EFFORT.default,
  // Empty: auxiliary requests use the chat's own model.
  helperModelId: "",
  smartBar: DEFAULT_SMART_BAR_SETTINGS,
};

export function mergePreferences(value: Partial<Preferences>): Preferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...value,
    smartBar: normalizeSmartBarSettings(value.smartBar),
  };
}

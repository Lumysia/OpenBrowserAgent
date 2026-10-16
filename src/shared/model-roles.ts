import { normalizePageTranslateSettings } from "./page-translate/settings";
import { normalizeSmartBarSettings } from "./smart-bar";
import type { Preferences } from "./types";

// The features that each use a model, in the order the Models table lists
// them, with where each keeps its choice. Unset means the chat's model
// (for the chat itself: the first configured model; for images: off).
export type ModelRole = {
  id: "chat" | "helper" | "smartBar" | "translation" | "images";
  get: (preferences: Preferences) => string | undefined;
  set: (preferences: Preferences, modelId: string | undefined) => Preferences;
};

export const MODEL_ROLES: readonly ModelRole[] = [
  {
    id: "chat",
    get: (preferences) => preferences.selectedModelId,
    set: (preferences, selectedModelId) => ({
      ...preferences,
      selectedModelId,
    }),
  },
  {
    id: "helper",
    get: (preferences) => preferences.helperModelId || undefined,
    set: (preferences, helperModelId) => ({ ...preferences, helperModelId }),
  },
  {
    id: "smartBar",
    get: (preferences) =>
      normalizeSmartBarSettings(preferences.smartBar).modelId || undefined,
    set: (preferences, modelId = "") => ({
      ...preferences,
      smartBar: { ...normalizeSmartBarSettings(preferences.smartBar), modelId },
    }),
  },
  {
    id: "translation",
    get: (preferences) =>
      normalizePageTranslateSettings(preferences.pageTranslate).modelId ||
      undefined,
    set: (preferences, modelId = "") => ({
      ...preferences,
      pageTranslate: {
        ...normalizePageTranslateSettings(preferences.pageTranslate),
        modelId,
      },
    }),
  },
  {
    id: "images",
    get: (preferences) => preferences.selectedImageModelId,
    set: (preferences, selectedImageModelId) => ({
      ...preferences,
      selectedImageModelId,
    }),
  },
];

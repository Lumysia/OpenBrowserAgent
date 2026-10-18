import {
  chatModels,
  configuredModels,
  imageModels,
  namedModel,
  type ProviderModels,
} from "./model-choice";
import { normalizePageTranslateSettings } from "./page-translate/settings";
import { normalizeSmartBarSettings } from "./smart-bar";
import type { Preferences, ProviderState } from "./types";

// The features that each use a model, in the order the Models table lists
// them, with where each keeps its choice and which models it can use.
// Unset, or naming no model it can use, means the chat's model (for the
// chat itself: the first configured model; for images: off).
export type ModelRole = {
  id: "chat" | "helper" | "smartBar" | "translation" | "images";
  models: ProviderModels;
  get: (preferences: Preferences) => string | undefined;
  set: (preferences: Preferences, modelId: string | undefined) => Preferences;
};

export const MODEL_ROLES: readonly ModelRole[] = [
  {
    id: "chat",
    models: chatModels,
    get: (preferences) => preferences.selectedModelId,
    set: (preferences, selectedModelId) => ({
      ...preferences,
      selectedModelId,
    }),
  },
  {
    id: "helper",
    models: chatModels,
    get: (preferences) => preferences.helperModelId || undefined,
    set: (preferences, helperModelId) => ({ ...preferences, helperModelId }),
  },
  {
    id: "smartBar",
    models: chatModels,
    get: (preferences) =>
      normalizeSmartBarSettings(preferences.smartBar).modelId || undefined,
    set: (preferences, modelId = "") => ({
      ...preferences,
      smartBar: { ...normalizeSmartBarSettings(preferences.smartBar), modelId },
    }),
  },
  {
    id: "translation",
    models: chatModels,
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
    models: imageModels,
    get: (preferences) => preferences.selectedImageModelId,
    set: (preferences, selectedImageModelId) => ({
      ...preferences,
      selectedImageModelId,
    }),
  },
];

// The configured models `role` can use, in the order its choice is looked
// up in.
export function roleModels(role: ModelRole, state: ProviderState | undefined) {
  return configuredModels(state, role.models);
}

// A change of the providers unsets each choice that named a model the
// change removed, so a model added again later is not chosen by itself.
export function forgetRemovedModels(
  preferences: Preferences,
  previous: ProviderState | undefined,
  next: ProviderState | undefined,
) {
  return MODEL_ROLES.reduce((current, role) => {
    const modelId = role.get(current);
    return namedModel(roleModels(role, previous), modelId) &&
      !namedModel(roleModels(role, next), modelId)
      ? role.set(current, undefined)
      : current;
  }, preferences);
}

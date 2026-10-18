import { normalizeProviderState } from "./provider-instances";
import type {
  ModelConfig,
  Preferences,
  ProviderConfig,
  ProviderState,
} from "./types";

// Which configured model (and so which provider) a request uses. Pure, so
// the background's requests and the side panel's checks before a send
// agree.

export type ModelChoice = {
  providerId: string;
  provider: ProviderConfig;
  model: ModelConfig;
};

type Providers = ReturnType<typeof normalizeProviderState>;

// The models of a provider a feature can use: chat models, or for images
// its image models and then its chat models.
export type ProviderModels = (provider: ProviderConfig) => ModelConfig[];

export const chatModels: ProviderModels = (provider) => provider.models || [];

export const imageModels: ProviderModels = (provider) => [
  ...(provider.imageModels || []),
  ...(provider.models || []),
];

// The model of `models` a stored choice names: by id, or by the name
// older choices hold.
export function namedModel(models: ModelConfig[], modelId: string | undefined) {
  if (!modelId) return undefined;
  return models.find(
    (candidate) => candidate.id === modelId || candidate.name === modelId,
  );
}

function findModel(
  providers: Providers,
  modelId: string | undefined,
  models: ProviderModels = chatModels,
): ModelChoice | undefined {
  for (const [providerId, provider] of Object.entries(providers)) {
    const model = namedModel(models(provider), modelId);
    if (model) return { providerId, provider, model };
  }
  return undefined;
}

// The first of `modelIds` that is configured (an agent's own model, then
// the composer's), else the stored selection, else the first model.
export function chooseChatModel(
  state: ProviderState,
  preferences: Preferences,
  ...modelIds: Array<string | undefined>
): ModelChoice | undefined {
  const providers = normalizeProviderState(state);
  for (const modelId of [...modelIds, preferences.selectedModelId]) {
    const choice = findModel(providers, modelId);
    if (choice) return choice;
  }
  const [providerId, provider] = Object.entries(providers)[0] || [];
  const model = provider?.models?.[0];
  return providerId && provider && model
    ? { providerId, provider, model }
    : undefined;
}

// The helper model (compaction, extraction and sub-agent summaries); none
// when it is the chat's own model.
export function chooseHelperModel(
  state: ProviderState,
  helperModelId: string | undefined,
) {
  return findModel(normalizeProviderState(state), helperModelId);
}

// The image model: the one asked for, else the one chosen in Settings.
// None while no configured model is chosen: image generation is off.
export function chooseImageModel(
  state: ProviderState,
  preferences: Preferences,
  modelId?: string,
) {
  const providers = normalizeProviderState(state);
  return (
    findModel(providers, modelId, imageModels) ??
    findModel(providers, preferences.selectedImageModelId, imageModels)
  );
}

// Every configured model of `models` (chat models), in provider order,
// the order a choice is looked up in. A model listed twice is the first.
export function configuredModels(
  state: ProviderState | undefined,
  models: ProviderModels = chatModels,
) {
  const seen = new Set<string>();
  return Object.values(normalizeProviderState(state))
    .flatMap(models)
    .filter((model) => !seen.has(model.id) && !!seen.add(model.id));
}

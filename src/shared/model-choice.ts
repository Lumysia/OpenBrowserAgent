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

function findModel(
  providers: Providers,
  modelId: string | undefined,
  models: (provider: ProviderConfig) => ModelConfig[] = (provider) =>
    provider.models || [],
): ModelChoice | undefined {
  if (!modelId) return undefined;
  for (const [providerId, provider] of Object.entries(providers)) {
    const model = models(provider).find(
      (candidate) => candidate.id === modelId || candidate.name === modelId,
    );
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
  const imageModels = (provider: ProviderConfig) => [
    ...(provider.imageModels || []),
    ...(provider.models || []),
  ];
  return (
    findModel(providers, modelId, imageModels) ??
    findModel(providers, preferences.selectedImageModelId, imageModels)
  );
}

// Every configured chat model, in provider order.
export function configuredModels(state: ProviderState | undefined) {
  return Object.values(normalizeProviderState(state)).flatMap(
    (provider) => provider.models || [],
  );
}

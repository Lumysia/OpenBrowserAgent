import { providerDefaultBaseUrls, type ProviderId } from "../shared/types";
import { storage } from "../shared/storage";

export async function resolveModel(modelId?: string) {
  const providers = await storage.provider.get();
  const preferences = await storage.preferences.get();
  const selectedModelId = modelId || preferences.selectedModelId;

  for (const [provider, config] of Object.entries(providers) as Array<
    [ProviderId, NonNullable<(typeof providers)[ProviderId]>]
  >) {
    const model = config.models?.find(
      (candidate) =>
        candidate.id === selectedModelId || candidate.name === selectedModelId,
    );
    if (model) {
      return {
        provider,
        apiKey: config.apiKey || "",
        baseUrl: config.baseUrl || providerDefaultBaseUrls[provider] || "",
        modelName: model.name || model.id,
      };
    }
  }

  const fallbackProvider = Object.entries(providers)[0] as
    | [ProviderId, NonNullable<(typeof providers)[ProviderId]>]
    | undefined;
  const fallbackModel = fallbackProvider?.[1].models?.[0];
  if (fallbackProvider && fallbackModel) {
    return {
      provider: fallbackProvider[0],
      apiKey: fallbackProvider[1].apiKey || "",
      baseUrl:
        fallbackProvider[1].baseUrl ||
        providerDefaultBaseUrls[fallbackProvider[0]] ||
        "",
      modelName: fallbackModel.name || fallbackModel.id,
    };
  }

  throw new Error("No model configured. Add an AI provider in Settings.");
}

import { normalizeProviderState } from "../shared/provider-instances";
import { providerDefaultBaseUrls } from "../shared/types";
import { storage } from "../shared/storage";

export async function resolveModel(modelId?: string) {
  const providers = normalizeProviderState(await storage.provider.get());
  const preferences = await storage.preferences.get();
  const selectedModelId = modelId || preferences.selectedModelId;

  for (const [, config] of Object.entries(providers)) {
    const provider = config.type || "openai";
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

  const fallbackProvider = Object.entries(providers)[0];
  const fallbackModel = fallbackProvider?.[1].models?.[0];
  if (fallbackProvider && fallbackModel) {
    const provider = fallbackProvider[1].type || "openai";
    return {
      provider,
      apiKey: fallbackProvider[1].apiKey || "",
      baseUrl:
        fallbackProvider[1].baseUrl || providerDefaultBaseUrls[provider] || "",
      modelName: fallbackModel.name || fallbackModel.id,
    };
  }

  throw new Error("No model configured. Add an AI provider in Settings.");
}

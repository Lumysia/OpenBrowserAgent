import type { ProviderModel } from "./pi-provider";
import { normalizeProviderState } from "../shared/provider-instances";
import { providerDefaultBaseUrls } from "../shared/types";
import { storage } from "../shared/storage";

// The first of `modelIds` that is configured (an agent's own model, then
// the composer's), else the stored selection, else the first model.
export async function resolveModel(...modelIds: Array<string | undefined>) {
  const providers = normalizeProviderState(await storage.provider.get());
  const preferences = await storage.preferences.get();
  for (const modelId of [...modelIds, preferences.selectedModelId]) {
    const model = modelId && findModel(providers, modelId);
    if (model) return model;
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
      contextLength: fallbackModel.contextLength,
    };
  }

  throw new Error("No model configured. Add an AI provider in Settings.");
}

// The helper model (compaction, later extraction and sub-agent summaries)
// defaults to the chat's own model unless the user picked another one.
export async function resolveHelperModel(
  helperModelId: string | undefined,
  chatModel: ProviderModel,
): Promise<ProviderModel> {
  if (!helperModelId) return chatModel;
  const providers = normalizeProviderState(await storage.provider.get());
  return findModel(providers, helperModelId) || chatModel;
}

function findModel(
  providers: ReturnType<typeof normalizeProviderState>,
  modelId: string | undefined,
): ProviderModel | undefined {
  for (const config of Object.values(providers)) {
    const provider = config.type || "openai";
    const model = config.models?.find(
      (candidate) => candidate.id === modelId || candidate.name === modelId,
    );
    if (model)
      return {
        provider,
        apiKey: config.apiKey || "",
        baseUrl: config.baseUrl || providerDefaultBaseUrls[provider] || "",
        modelName: model.name || model.id,
        contextLength: model.contextLength,
      };
  }
  return undefined;
}

export async function resolveImageModel(modelId?: string) {
  const providers = normalizeProviderState(await storage.provider.get());
  const preferences = await storage.preferences.get();
  const selectedModelId = modelId || preferences.selectedImageModelId;

  for (const [, config] of Object.entries(providers)) {
    const provider = config.type || "openai";
    const availableModels = [
      ...(config.imageModels || []),
      ...(config.models || []),
    ];
    const model = availableModels.find(
      (candidate) =>
        candidate.id === selectedModelId || candidate.name === selectedModelId,
    );
    if (model) {
      return {
        provider,
        apiKey: config.apiKey || "",
        baseUrl: config.baseUrl || providerDefaultBaseUrls[provider] || "",
        modelName: model.name || model.id,
        contextLength: model.contextLength,
      };
    }
  }

  throw new Error("No image model configured. Select a model in Settings.");
}

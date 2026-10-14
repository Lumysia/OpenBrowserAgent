import type { ProviderModel } from "./pi-provider";
import {
  chooseChatModel,
  chooseHelperModel,
  chooseImageModel,
  type ModelChoice,
} from "../shared/model-choice";
import { assertProviderConsent } from "../shared/provider-consent";
import { providerDefaultBaseUrls } from "../shared/types";
import { storage } from "../shared/storage";
import { USER_ERROR_CODE, UserError } from "../shared/user-errors";

// Every model request gets its endpoint here, so this is where a provider
// without the user's permission to receive their content is stopped
// (ProviderConsentError) before anything is sent.
function providerModel({
  providerId,
  provider: config,
  model,
}: ModelChoice): ProviderModel {
  assertProviderConsent(providerId, config);
  const provider = config.type || "openai";
  return {
    provider,
    apiKey: config.apiKey || "",
    baseUrl: config.baseUrl || providerDefaultBaseUrls[provider] || "",
    modelName: model.name || model.id,
    contextLength: model.contextLength,
  };
}

// The first of `modelIds` that is configured (an agent's own model, then
// the composer's), else the stored selection, else the first model.
export async function resolveModel(...modelIds: Array<string | undefined>) {
  const [providers, preferences] = await Promise.all([
    storage.provider.get(),
    storage.preferences.get(),
  ]);
  const choice = chooseChatModel(providers, preferences, ...modelIds);
  if (choice) return providerModel(choice);
  throw new UserError(
    USER_ERROR_CODE.noModel,
    "No model configured. Add an AI provider in Settings.",
  );
}

// The helper model (compaction, later extraction and sub-agent summaries)
// defaults to the chat's own model unless the user picked another one.
export async function resolveHelperModel(
  helperModelId: string | undefined,
  chatModel: ProviderModel,
): Promise<ProviderModel> {
  if (!helperModelId) return chatModel;
  const choice = chooseHelperModel(await storage.provider.get(), helperModelId);
  return choice ? providerModel(choice) : chatModel;
}

export async function resolveImageModel(modelId?: string) {
  const [providers, preferences] = await Promise.all([
    storage.provider.get(),
    storage.preferences.get(),
  ]);
  const choice = chooseImageModel(providers, preferences, modelId);
  if (choice) return providerModel(choice);
  throw new Error("No image model configured. Select a model in Settings.");
}

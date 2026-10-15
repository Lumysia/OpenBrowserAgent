import type { ProviderModel } from "./pi-provider";
import {
  chooseChatModel,
  chooseHelperModel,
  chooseImageModel,
  type ModelChoice,
} from "../shared/model-choice";
import { modelRef } from "../shared/model-limits";
import { assertProviderConsent } from "../shared/provider-consent";
import { providerThinkingSwitch } from "../shared/thinking-switch";
import { providerBaseUrl } from "../shared/provider-urls";
import { storage } from "../shared/storage";
import { NO_SYNC_BACKEND_ID } from "../shared/sync-backends";
import { providerKeyLocked, syncKeysLocked } from "../shared/sync-keys-lock";
import type { ProviderConfig } from "../shared/types";
import { USER_ERROR_CODE, UserError } from "../shared/user-errors";

// Every model request gets its endpoint here, so this is where a provider
// without the user's permission to receive their content is stopped
// (ProviderConsentError) before anything is sent.
export function providerModel(choice: ModelChoice): ProviderModel {
  const { providerId, provider: config, model } = choice;
  assertProviderConsent(providerId, config);
  const provider = config.type || "openai";
  return {
    provider,
    apiKey: config.apiKey || "",
    baseUrl: providerBaseUrl(provider, config.baseUrl),
    modelName: model.name || model.id,
    contextLength: model.contextLength,
    thinkingSwitch: providerThinkingSwitch(provider, config),
    ref: modelRef(choice),
  };
}

// A provider whose key is synced but still locked would only get a bare
// 401: the user is told to enter the sync passphrase instead, before
// anything is sent.
async function assertProviderKey(provider: ProviderConfig) {
  if (!providerKeyLocked(provider, true)) return;
  const [status, activeBackendId] = await Promise.all([
    storage.syncStatus.get(),
    storage.activeSyncBackendId.get(),
  ]);
  if (
    providerKeyLocked(
      provider,
      syncKeysLocked(status, activeBackendId !== NO_SYNC_BACKEND_ID),
    )
  )
    throw new UserError(
      USER_ERROR_CODE.syncKeysLocked,
      "The provider's API key is synced but locked by the sync passphrase.",
    );
}

async function unlockedModel(choice: ModelChoice) {
  await assertProviderKey(choice.provider);
  return providerModel(choice);
}

// The first of `modelIds` that is configured (an agent's own model, then
// the composer's), else the stored selection, else the first model.
export async function resolveModel(...modelIds: Array<string | undefined>) {
  const [providers, preferences] = await Promise.all([
    storage.provider.get(),
    storage.preferences.get(),
  ]);
  const choice = chooseChatModel(providers, preferences, ...modelIds);
  if (choice) return unlockedModel(choice);
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
  return choice ? unlockedModel(choice) : chatModel;
}

export async function resolveImageModel(modelId?: string) {
  const [providers, preferences] = await Promise.all([
    storage.provider.get(),
    storage.preferences.get(),
  ]);
  const choice = chooseImageModel(providers, preferences, modelId);
  if (choice) return unlockedModel(choice);
  throw new UserError(
    USER_ERROR_CODE.noImageModel,
    "No image model configured. Select a model in Settings.",
  );
}

import { sendRuntimeRequest } from "./runtime-messages";
import type { ModelConfig, ProviderConfig } from "./types";

// Requests Settings makes of a provider, with the provider form's unsaved
// values. The background sends them, behind the same permission check as
// chat.

// "Test model": one short request through the same path chat uses.
export const TEST_PROVIDER_MODEL = "testProviderModel";
// "Load models": the models the provider's endpoint lists.
export const LIST_PROVIDER_MODELS = "listProviderModels";

export type TestProviderModelRequest = {
  type: typeof TEST_PROVIDER_MODEL;
  providerId: string;
  config: ProviderConfig;
  modelName: string;
};

export type ListProviderModelsRequest = {
  type: typeof LIST_PROVIDER_MODELS;
  providerId: string;
  config: ProviderConfig;
};

export type ProviderRequest =
  TestProviderModelRequest | ListProviderModelsRequest;

export async function testProviderModel(
  providerId: string,
  config: ProviderConfig,
  modelName: string,
) {
  const request: TestProviderModelRequest = {
    type: TEST_PROVIDER_MODEL,
    providerId,
    config,
    modelName,
  };
  await sendRuntimeRequest<void>(request, "Provider test");
}

// The provider's models, named "<provider> / <label>".
export function listProviderModels(providerId: string, config: ProviderConfig) {
  const request: ListProviderModelsRequest = {
    type: LIST_PROVIDER_MODELS,
    providerId,
    config,
  };
  return sendRuntimeRequest<ModelConfig[]>(request, "Provider models");
}

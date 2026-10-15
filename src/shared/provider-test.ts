import { sendRuntimeRequest } from "./runtime-messages";
import type { ProviderConfig } from "./types";

// "Test model" in Settings: the background sends one short request through
// the same path chat uses, with the provider form's unsaved values.
export const TEST_PROVIDER_MODEL = "testProviderModel";

export type TestProviderModelRequest = {
  type: typeof TEST_PROVIDER_MODEL;
  providerId: string;
  config: ProviderConfig;
  modelName: string;
};

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

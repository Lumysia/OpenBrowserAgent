import { getBrowserApi } from "./browser-api";
import type { MessageReply } from "./message-reply";
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
  const reply = (await getBrowserApi().runtime.sendMessage(request)) as
    MessageReply | undefined;
  if (!reply) throw new Error("The background did not answer.");
  if (!reply.ok) throw new Error(reply.error);
}

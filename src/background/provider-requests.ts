import { respondWith, type RuntimeReply } from "../shared/runtime-messages";
import {
  LIST_PROVIDER_MODELS,
  TEST_PROVIDER_MODEL,
  type ListProviderModelsRequest,
  type ProviderRequest,
  type TestProviderModelRequest,
} from "../shared/provider-requests";
import { modelDisplayName, providerDisplayName } from "../shared/model-display";
import { assertProviderConsent } from "../shared/provider-consent";
import {
  modelListRequest,
  parseModelList,
} from "../shared/provider-model-list";
import { providerTypeFromId } from "../shared/provider-instances";
import type { ModelConfig } from "../shared/types";
import { providerModel } from "./model-resolver";
import { requestText } from "./pi-provider";

const TEST_SYSTEM_PROMPT = "You are checking whether this model can respond.";
const TEST_PROMPT = "Reply with exactly: OK";

async function testModel({
  providerId,
  config,
  modelName,
}: TestProviderModelRequest) {
  // providerModel stops a provider without the user's permission, as for
  // every other request.
  const model = providerModel({
    providerId,
    provider: config,
    model: { id: `${providerId}:${modelName}`, name: modelName },
  });
  await requestText(model, { system: TEST_SYSTEM_PROMPT, prompt: TEST_PROMPT });
}

// The models the provider's endpoint lists, named "<provider> / <label>".
export async function listModels({
  providerId,
  config,
}: Pick<ListProviderModelsRequest, "providerId" | "config">): Promise<
  ModelConfig[]
> {
  // The request carries the user's API key, so it goes only where chat may.
  assertProviderConsent(providerId, config);
  const type = providerTypeFromId(providerId, config.type);
  const { url, headers } = modelListRequest(type, config);
  const response = await fetch(url, { headers });
  if (!response.ok)
    throw new Error(
      (await response.text()).trim() || `HTTP ${response.status}`,
    );
  const provider = providerDisplayName({ ...config, type });
  return parseModelList(type, await response.json()).map(
    ({ name, label, contextLength }) => ({
      id: `${providerId}:${name}`,
      name,
      displayName: modelDisplayName(provider, label || name),
      ...(contextLength ? { contextLength } : {}),
    }),
  );
}

export function handleProviderRequestMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (reply: RuntimeReply) => void,
) {
  const request = message as Partial<ProviderRequest> | undefined;
  if (
    request?.type !== TEST_PROVIDER_MODEL &&
    request?.type !== LIST_PROVIDER_MODELS
  )
    return false;
  // The extension's own pages only, never a content script in a web page.
  if (
    sender.id !== chrome.runtime.id ||
    !sender.url?.startsWith(chrome.runtime.getURL(""))
  )
    return false;
  return respondWith<unknown>(
    request.type === TEST_PROVIDER_MODEL
      ? testModel(request as TestProviderModelRequest)
      : listModels(request as ListProviderModelsRequest),
    sendResponse,
  );
}

import { replyWith, type MessageReply } from "../shared/message-reply";
import {
  TEST_PROVIDER_MODEL,
  type TestProviderModelRequest,
} from "../shared/provider-test";
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

export function handleProviderTestMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageReply) => void,
) {
  const request = message as Partial<TestProviderModelRequest> | undefined;
  if (request?.type !== TEST_PROVIDER_MODEL) return false;
  // The extension's own pages only, never a content script in a web page.
  if (
    sender.id !== chrome.runtime.id ||
    !sender.url?.startsWith(chrome.runtime.getURL(""))
  )
    return false;
  replyWith(testModel(request as TestProviderModelRequest), sendResponse);
  return true;
}

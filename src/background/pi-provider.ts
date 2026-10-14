import type { StreamFn } from "@earendil-works/pi-agent-core";
import type {
  Api,
  Model,
  Message,
  AssistantMessage,
  AssistantMessageEvent,
} from "@earendil-works/pi-ai";
import * as chatApi from "@earendil-works/pi-ai/api/openai-completions";
import * as responsesApi from "@earendil-works/pi-ai/api/openai-responses";
import * as anthropicApi from "@earendil-works/pi-ai/api/anthropic-messages";
import * as googleApi from "@earendil-works/pi-ai/api/google-generative-ai";
import type { Usage } from "@earendil-works/pi-ai";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import {
  QUICK_TASK_REASONING,
  reasoningRequestParams,
  type RequestReasoning,
} from "../shared/reasoning";
import { baseUrlKey } from "../shared/provider-urls";
import type { ThinkingSwitch } from "../shared/thinking-switch";
import type { ProviderId } from "../shared/types";
import { quickThinking, thinkingFieldNames } from "./quick-reasoning";
import {
  FIELD_REJECTION_STATUSES,
  rejectsField,
  requestRejection,
  statusRecorder,
} from "./request-rejection";

export type ProviderModel = {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  contextLength?: number;
  thinkingSwitch?: ThinkingSwitch;
};

export function piModel(model: ProviderModel): Model<Api> {
  const api =
    model.provider === "anthropic"
      ? "anthropic-messages"
      : model.provider === "gemini"
        ? "google-generative-ai"
        : model.provider === "openai-responses"
          ? "openai-responses"
          : "openai-completions";
  let baseUrl = model.baseUrl.replace(/\/$/, "");
  // The Anthropic SDK itself appends /v1/messages. The stored URL includes /v1.
  if (api === "anthropic-messages") baseUrl = baseUrl.replace(/\/v1$/, "");
  if (model.provider === "ollama") baseUrl += "/v1";
  return {
    id: model.modelName,
    name: model.modelName,
    api,
    provider: model.provider,
    baseUrl,
    reasoning: true,
    // "default" means let the endpoint choose; Pi otherwise sends effort=none.
    thinkingLevelMap: { off: null },
    input: ["text", "image"],
    contextWindow: model.contextLength || 128_000,
    maxTokens: 8192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    // Tools loaded mid-run are declared in a system message after the cached
    // prefix instead of changing the tool list. Models without this support
    // reject such a request; createProviderStream then falls back.
    ...(api === "anthropic-messages"
      ? {
          compat: {
            supportsMidConvoSystemMessages: true,
            supportsMidConvoToolChanges: true,
          },
        }
      : {}),
    ...(api === "openai-completions"
      ? {
          compat: {
            supportsStore: false,
            supportsDeveloperRole: false,
            supportsFinishReason: true,
            supportsStrictMode: false,
            thinkingFormat: "openai" as const,
          },
        }
      : {}),
  };
}

export function assistantMessage(model: Model<Api>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

// Pi's adapter for each API the provider types use.
const APIS = {
  "openai-completions": chatApi,
  "openai-responses": responsesApi,
  "anthropic-messages": anthropicApi,
  "google-generative-ai": googleApi,
} as const;

function apiOf(model: Model<Api>) {
  return APIS[model.api as keyof typeof APIS] || chatApi;
}

// Transient failures (429, 5xx, network) before the response starts are
// retried with backoff by Pi's provider wrapper (Retry-After honoured).
const PROVIDER_RETRIES = 3;

// Models that rejected mid-conversation tool declarations, for the life of
// the service worker.
const withoutInlineTools = new Set<string>();
// Models that rejected the quick-task thinking fields, likewise.
const withoutQuickReasoning = new Set<string>();

// Pi owns parsing and streaming. This adapter supplies extension configuration,
// retries, and the product's single retries without what a model rejects:
// image content, mid-conversation tool declarations (the tool list then
// carries every loaded tool), or the quick-task thinking fields. Prompt
// caching uses Pi's defaults: Anthropic breakpoints on tools, system prompt
// and the latest message; automatic caching elsewhere.
export function createProviderStream(
  configuration: ProviderModel,
  reasoning?: RequestReasoning,
  onImageRejected?: () => void,
): StreamFn {
  let textOnly = false;
  const modelKey = `${baseUrlKey(configuration.baseUrl)}|${configuration.modelName}`;
  let inlineTools = !withoutInlineTools.has(modelKey);
  const quick = reasoning === QUICK_TASK_REASONING;
  return (requested, context, options) => {
    let model = inlineTools ? requested : { ...requested, compat: undefined };
    const output = new AssistantMessageEventStream();
    const run = async (
      messages: Message[],
      canRetry: boolean,
    ): Promise<void> => {
      const quickRequest =
        quick && !withoutQuickReasoning.has(modelKey)
          ? quickThinking(configuration, model)
          : undefined;
      // The thinking fields Pi wrote for the quick level.
      let quickFields: string[] = [];
      const responses = statusRecorder(
        model.api === "anthropic-messages"
          ? anthropicFetch(configuration.baseUrl)
          : undefined,
      );
      const providerOptions = {
        ...options,
        apiKey: configuration.apiKey || "local-no-key",
        headers: configuration.apiKey
          ? undefined
          : {
              authorization: null,
              "x-api-key": null,
              "x-goog-api-key": null,
            },
        maxRetries: PROVIDER_RETRIES,
        // The Gemini SDK takes no fetch function.
        fetch:
          model.api === "google-generative-ai" ? undefined : responses.fetch,
        onPayload: (payload: unknown) => {
          if (!quickRequest)
            return withEffort(
              payload,
              model.api,
              configuration.provider,
              reasoning,
            );
          quickFields = thinkingFieldNames(model.api, payload);
          return payload;
        },
      };
      let started = false;
      let pendingStart:
        Extract<AssistantMessageEvent, { type: "start" }> | undefined;
      const events = quickRequest
        ? apiOf(model).streamSimple(
            quickRequest.model as never,
            normalizeContext({ messages }),
            { ...providerOptions, reasoning: quickRequest.level },
          )
        : apiOf(model).stream(
            model as never,
            normalizeContext({ messages }),
            providerOptions,
          );
      for await (const event of events) {
        if (event.type === "start") {
          pendingStart = event;
          continue;
        }
        const rejection =
          event.type === "error" && !started && event.reason !== "aborted"
            ? requestRejection(
                model.api,
                event.error.errorMessage || "",
                responses.status(),
              )
            : undefined;
        if (
          rejection &&
          canRetry &&
          rejectsField(rejection, [IMAGE_REJECTION])
        ) {
          textOnly = true;
          onImageRejected?.();
          return run(withoutImages(messages), false);
        }
        if (
          rejection &&
          inlineTools &&
          model.compat &&
          rejectsField(rejection, [INLINE_TOOLS_REJECTION])
        ) {
          inlineTools = false;
          withoutInlineTools.add(modelKey);
          model = { ...model, compat: undefined };
          return run(messages, canRetry);
        }
        // Only a refusal that names a field the quick level added: the
        // same request is then sent without them.
        if (
          rejection &&
          quickRequest &&
          rejectsField(rejection, quickFields, FIELD_REJECTION_STATUSES)
        ) {
          withoutQuickReasoning.add(modelKey);
          return run(messages, canRetry);
        }

        // Delay only the empty start, not content. A rejected request must not
        // append a phantom assistant to Pi's transcript before its retry.
        if (pendingStart) {
          output.push(pendingStart);
          pendingStart = undefined;
        }
        if (event.type !== "error") started = true;
        output.push(event);
      }
      output.end();
    };
    const messages = textOnly
      ? withoutImages(context.messages)
      : context.messages;
    void run(messages, !textOnly && hasImages(messages)).catch((error) => {
      const message = assistantMessage(model);
      message.stopReason = options?.signal?.aborted ? "aborted" : "error";
      message.errorMessage =
        error instanceof Error ? error.message : String(error);
      output.push({
        type: "error",
        reason: message.stopReason,
        error: message,
      });
      output.end();
    });
    return output;
  };
}

// The user's reasoning effort, where the endpoint takes one.
function withEffort(
  payload: unknown,
  api: Api,
  provider: ProviderId,
  reasoning: RequestReasoning | undefined,
) {
  const params = reasoningRequestParams(
    provider,
    reasoning === QUICK_TASK_REASONING ? undefined : reasoning,
  );
  return {
    ...(payload as object),
    ...(api === "openai-responses" && params.reasoning_effort
      ? {
          reasoning: { effort: params.reasoning_effort, summary: "auto" },
          include: ["reasoning.encrypted_content"],
        }
      : params),
  };
}

function hasImages(messages: Message[]) {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === "image"),
  );
}

function anthropicFetch(baseUrl: string): typeof fetch {
  // Pi's SDK appends /v1/messages. The extension's saved base URLs historically
  // target <base>/messages, including proxies whose path has no /v1 suffix.
  return (input, init) => {
    const original = new URL(
      input instanceof Request ? input.url : String(input),
    );
    const endpoint = new URL(`${baseUrl.replace(/\/$/, "")}/messages`);
    endpoint.search = original.search;
    return fetch(
      input instanceof Request ? new Request(endpoint, input) : endpoint,
      init,
    );
  };
}

// Endpoints word these refusals in their own ways; the patterns cover the
// wordings seen from the supported servers.
const INLINE_TOOLS_REJECTION =
  /tool_addition|tool_removal|inline-tools|\bsystem\b.{0,40}(role|message)|(role|message).{0,40}\bsystem\b/i;

const IMAGE_REJECTION =
  /(?:image|non-text|multimodal|image_url|input_image).*?(?:unsupported|not support|unknown|invalid)|(?:unsupported|not support|unknown variant|invalid).*?(?:image|non-text|multimodal)|expected [`']?text/i;

function withoutImages(messages: Message[]): Message[] {
  return [
    ...messages.map((message): Message => {
      if (message.role !== "user" && message.role !== "toolResult")
        return message;
      if (typeof message.content === "string") return message;
      return {
        ...message,
        content: message.content.map((part) =>
          part.type === "image"
            ? {
                type: "text" as const,
                text: "[Image omitted: the selected model rejected non-text content.]",
              }
            : part,
        ),
      };
    }),
    {
      role: "user",
      timestamp: Date.now(),
      content:
        "<internal_instruction>The selected model rejected non-text content. Continue using text-only browser inspection and file metadata. Do not request screenshots or media again in this run. If visual evidence is needed, explain the limitation and ask the user to switch to a model that supports images.</internal_instruction>",
    },
  ];
}

// One plain-text request outside the agent loop (titles, compaction, smart
// bar, page translation). `onText` receives the answer's text as it streams;
// `onThinking` is called when the model reasons before answering.
export type TextRequestOptions = {
  signal?: AbortSignal;
  reasoning?: RequestReasoning;
  onText?: (delta: string) => void;
  onThinking?: () => void;
};

export async function requestText(
  model: ProviderModel,
  request: { system?: string; prompt: string },
  { signal, reasoning, onText, onThinking }: TextRequestOptions = {},
): Promise<{ text: string; usage: Usage }> {
  const events = await createProviderStream(model, reasoning)(
    piModel(model),
    normalizeContext({
      systemPrompt: request.system,
      messages: [
        { role: "user", content: request.prompt, timestamp: Date.now() },
      ],
    }),
    { signal },
  );
  if (onText || onThinking)
    for await (const event of events) {
      if (event.type === "text_delta") onText?.(event.delta);
      else if (event.type === "thinking_delta") onThinking?.();
    }
  const result = await events.result();
  if (result.stopReason === "error" || result.stopReason === "aborted")
    throw new Error(result.errorMessage || result.stopReason);
  return {
    text: result.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
    usage: result.usage,
  };
}

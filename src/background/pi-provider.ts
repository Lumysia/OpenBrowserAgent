import type { StreamFn } from "@earendil-works/pi-agent-core";
import type {
  Api,
  Model,
  Message,
  AssistantMessage,
  AssistantMessageEvent,
} from "@earendil-works/pi-ai";
import { stream as chatStream } from "@earendil-works/pi-ai/api/openai-completions";
import { stream as responsesStream } from "@earendil-works/pi-ai/api/openai-responses";
import { stream as anthropicStream } from "@earendil-works/pi-ai/api/anthropic-messages";
import { stream as googleStream } from "@earendil-works/pi-ai/api/google-generative-ai";
import type { Usage } from "@earendil-works/pi-ai";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import {
  reasoningRequestParams,
  type ReasoningEffort,
} from "../shared/reasoning";
import type { ProviderId } from "../shared/types";

export type ProviderModel = {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  contextLength?: number;
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

// Transient failures (429, 5xx, network) before the response starts are
// retried with backoff by Pi's provider wrapper (Retry-After honoured).
const PROVIDER_RETRIES = 3;

// Models that rejected mid-conversation tool declarations, for the life of
// the service worker.
const withoutInlineTools = new Set<string>();

// Pi owns parsing and streaming. This adapter supplies extension configuration,
// retries, and the product's single retries without what a model rejects:
// image content, or mid-conversation tool declarations (the tool list then
// carries every loaded tool). Prompt caching uses Pi's defaults: Anthropic
// breakpoints on tools, system prompt and the latest message; automatic
// caching elsewhere.
export function createProviderStream(
  configuration: ProviderModel,
  effort?: ReasoningEffort,
  onImageRejected?: () => void,
): StreamFn {
  let textOnly = false;
  const modelKey = `${configuration.baseUrl}|${configuration.modelName}`;
  let inlineTools = !withoutInlineTools.has(modelKey);
  return (requested, context, options) => {
    let model = inlineTools ? requested : { ...requested, compat: undefined };
    const output = new AssistantMessageEventStream();
    const stream =
      model.api === "anthropic-messages"
        ? anthropicStream
        : model.api === "google-generative-ai"
          ? googleStream
          : model.api === "openai-responses"
            ? responsesStream
            : chatStream;
    const run = async (
      messages: Message[],
      canRetry: boolean,
    ): Promise<void> => {
      const reasoning = reasoningRequestParams(configuration.provider, effort);
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
        fetch:
          model.api === "anthropic-messages"
            ? anthropicFetch(configuration.baseUrl)
            : undefined,
        onPayload: (payload: unknown) => ({
          ...(payload as object),
          ...(model.api === "openai-responses" && reasoning.reasoning_effort
            ? {
                reasoning: {
                  effort: reasoning.reasoning_effort,
                  summary: "auto",
                },
                include: ["reasoning.encrypted_content"],
              }
            : reasoning),
        }),
      };
      let started = false;
      let pendingStart:
        Extract<AssistantMessageEvent, { type: "start" }> | undefined;
      const events = stream(
        model as never,
        normalizeContext({ messages }),
        providerOptions,
      );
      for await (const event of events) {
        if (event.type === "start") {
          pendingStart = event;
          continue;
        }
        if (
          event.type === "error" &&
          canRetry &&
          !started &&
          event.reason !== "aborted" &&
          rejectsImages(event.error.errorMessage || "")
        ) {
          textOnly = true;
          onImageRejected?.();
          return run(withoutImages(messages), false);
        }
        if (
          event.type === "error" &&
          inlineTools &&
          model.compat &&
          !started &&
          event.reason !== "aborted" &&
          rejectsInlineTools(event.error.errorMessage || "")
        ) {
          inlineTools = false;
          withoutInlineTools.add(modelKey);
          model = { ...model, compat: undefined };
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

function rejectsInlineTools(error: string) {
  return /tool_addition|tool_removal|inline-tools|\bsystem\b.{0,40}(role|message)|(role|message).{0,40}\bsystem\b/i.test(
    error,
  );
}

function rejectsImages(error: string) {
  return /(?:image|non-text|multimodal|image_url|input_image).*?(?:unsupported|not support|unknown|invalid)|(?:unsupported|not support|unknown variant|invalid).*?(?:image|non-text|multimodal)|expected [`']?text/i.test(
    error,
  );
}

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
// bar). `onText` receives the answer's text as it streams.
export async function requestText(
  model: ProviderModel,
  request: { system?: string; prompt: string },
  signal?: AbortSignal,
  onText?: (delta: string) => void,
): Promise<{ text: string; usage: Usage }> {
  const events = await createProviderStream(model)(
    piModel(model),
    normalizeContext({
      systemPrompt: request.system,
      messages: [
        { role: "user", content: request.prompt, timestamp: Date.now() },
      ],
    }),
    { signal },
  );
  if (onText)
    for await (const event of events)
      if (event.type === "text_delta") onText(event.delta);
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

// The provider types: everything the extension knows about each one, in one
// place. Code reads these properties instead of comparing type ids.

// The wire API, as Pi names its adapters.
export type ProviderApi =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai";

// How a chat completions service takes a thinking level (Pi's
// thinkingFormat).
export type ProviderThinkingFormat =
  "openai" | "openrouter" | "deepseek" | "zai";

// How each wire API takes the API key. Requests without a key leave the
// header out (a local endpoint may refuse a placeholder key).
export const PROVIDER_APIS = {
  "openai-completions": { authHeader: "authorization", modelList: "openai" },
  "openai-responses": { authHeader: "authorization", modelList: "openai" },
  "anthropic-messages": { authHeader: "x-api-key", modelList: "anthropic" },
  "google-generative-ai": { authHeader: "x-goog-api-key", modelList: "gemini" },
} as const satisfies Record<
  ProviderApi,
  { authHeader: string; modelList: ProviderModelList }
>;

// The request that lists an endpoint's models (see provider-model-list.ts).
export type ProviderModelList = "openai" | "anthropic" | "gemini" | "ollama";

export type ProviderType = {
  // The default name of a new provider of this type.
  label: string;
  // The default name older versions stored; it shows like `label`.
  legacyLabel?: string;
  api: ProviderApi;
  defaultBaseUrl?: string;
  // Other base URLs the service offers (regions); settings offer these and
  // the default instead of a free text field.
  alternateBaseUrls?: readonly string[];
  // Where requests go when no base URL is set (the SDK's own default, with
  // the API version, as a stored base URL would have it). Settings have no
  // base URL field for such a type.
  sdkEndpoint?: string;
  // The path under the stored base URL that serves the API, for types whose
  // base URL is the server's root (Ollama serves OpenAI's API under /v1).
  apiPath?: string;
  // The request field for the user's reasoning effort, where the service
  // takes one: OpenAI's `reasoning_effort`, or `reasoning: { effort }`.
  reasoningParam?: "reasoning_effort" | "reasoning.effort";
  // How the service takes a thinking level for quick tasks, when Pi's
  // catalog does not say (default "openai").
  thinkingFormat?: ProviderThinkingFormat;
  // Models the catalog does not know still take `reasoning_effort` (Ollama
  // maps it to its own switch).
  quickReasoningEffort?: boolean;
  // The endpoint takes any OpenAI-compatible server, so the user picks how
  // it switches thinking off (see thinking-switch.ts).
  thinkingSwitch?: boolean;
  // Quick tasks (page translation batches) at once on one endpoint; the
  // default is QUICK_TASK_CONCURRENCY in config.ts.
  quickTaskConcurrency?: number;
  // The endpoint takes no API key; settings have no field for one.
  keyless?: boolean;
  // How the endpoint lists its models, when not as its API does.
  modelList?: ProviderModelList;
  // Offered when adding a provider.
  addable?: boolean;
  // Models can be added by name, besides those the endpoint lists.
  manualModels?: boolean;
};

export const PROVIDERS = {
  openai: {
    label: "OpenAI-compatible",
    api: "openai-completions",
    defaultBaseUrl: "https://api.openai.com/v1",
    reasoningParam: "reasoning_effort",
    thinkingSwitch: true,
    addable: true,
    manualModels: true,
  },
  "openai-responses": {
    label: "OpenAI Responses-compatible",
    legacyLabel: "OpenAI Responses",
    api: "openai-responses",
    defaultBaseUrl: "https://api.openai.com/v1",
    reasoningParam: "reasoning_effort",
    addable: true,
    manualModels: true,
  },
  anthropic: {
    label: "Anthropic-compatible",
    api: "anthropic-messages",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    addable: true,
    manualModels: true,
  },
  ollama: {
    label: "Ollama-compatible",
    legacyLabel: "Ollama",
    api: "openai-completions",
    defaultBaseUrl: "http://localhost:11434",
    apiPath: "/v1",
    keyless: true,
    // Ollama's own API, beside the OpenAI one under /v1.
    modelList: "ollama",
    quickReasoningEffort: true,
    thinkingSwitch: true,
    // A local runtime runs few requests at once.
    quickTaskConcurrency: 2,
    addable: true,
  },
  gemini: {
    label: "Gemini-compatible",
    legacyLabel: "Gemini",
    api: "google-generative-ai",
    sdkEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    addable: true,
  },
  deepseek: {
    label: "DeepSeek",
    api: "openai-completions",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    reasoningParam: "reasoning_effort",
    thinkingFormat: "deepseek",
  },
  openrouter: {
    label: "OpenRouter",
    api: "openai-completions",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    reasoningParam: "reasoning.effort",
    thinkingFormat: "openrouter",
  },
  aihubmix: {
    label: "AIHubMix",
    api: "openai-completions",
    defaultBaseUrl: "https://aihubmix.com/v1",
    reasoningParam: "reasoning_effort",
    thinkingSwitch: true,
  },
  glm: {
    label: "Z.ai (Zhipu)",
    api: "openai-completions",
    defaultBaseUrl: "https://api.z.ai/api/paas/v4",
    alternateBaseUrls: ["https://open.bigmodel.cn/api/paas/v4"],
    reasoningParam: "reasoning_effort",
    thinkingFormat: "zai",
  },
  aigateway: {
    label: "Vercel AI Gateway",
    api: "openai-completions",
    defaultBaseUrl: "https://api.ai-gateway.workers.dev/v1",
    thinkingSwitch: true,
  },
  minimax: {
    label: "Minimax",
    api: "openai-completions",
    defaultBaseUrl: "https://api.minimax.io/v1",
    alternateBaseUrls: ["https://api.minimaxi.com/v1"],
    thinkingSwitch: true,
    manualModels: true,
  },
} as const satisfies Record<string, ProviderType>;

export type ProviderId = keyof typeof PROVIDERS;

// In the order the settings list them.
export const PROVIDER_TYPES = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.hasOwn(PROVIDERS, value);
}

// The type's properties; OpenAI-compatible for an unknown type.
export function providerType(type: string | undefined): ProviderType {
  return isProviderId(type) ? PROVIDERS[type] : PROVIDERS.openai;
}

export const ADD_PROVIDER_TYPES = PROVIDER_TYPES.filter(
  (type) => providerType(type).addable,
);

// The base URLs settings offer for the type: none (a free text field), or
// its default and alternates.
export function providerBaseUrlOptions(type: string | undefined) {
  const { defaultBaseUrl, alternateBaseUrls } = providerType(type);
  return defaultBaseUrl && alternateBaseUrls
    ? [defaultBaseUrl, ...alternateBaseUrls]
    : [];
}

export function providerModelList(type: string | undefined) {
  const { api, modelList } = providerType(type);
  return modelList ?? PROVIDER_APIS[api].modelList;
}

// The header that carries the API key, in lower case.
export function providerAuthHeader(type: string | undefined) {
  return PROVIDER_APIS[providerType(type).api].authHeader;
}

// The API key as the type's API takes it; none without a key.
export function providerAuthHeaders(
  type: string | undefined,
  apiKey: string | undefined,
): Record<string, string> {
  if (!apiKey) return {};
  const header = providerAuthHeader(type);
  return { [header]: header === "authorization" ? `Bearer ${apiKey}` : apiKey };
}

// One spelling of an endpoint's base URL, for keys and for appending paths.
export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

// The key of an endpoint, for state kept per endpoint.
export function baseUrlKey(baseUrl: string) {
  return normalizeBaseUrl(baseUrl).toLowerCase();
}

export function openAIChatCompletionsUrl(baseUrl: string) {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}

export function ollamaChatCompletionsUrl(baseUrl: string) {
  return `${normalizeBaseUrl(baseUrl)}/v1/chat/completions`;
}

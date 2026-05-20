export function openAIChatCompletionsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

export function ollamaChatCompletionsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
}

import { readContextLength } from "../../src/shared/model-context";
import {
  providerDefaultBaseUrls,
  providerLabels,
  type ModelConfig,
  type ProviderConfig,
  type ProviderId,
} from "../../src/shared/types";
import { loadOllamaModels } from "./ollama-models";

export async function loadProviderModels(
  providerId: string,
  provider: ProviderId,
  config: ProviderConfig,
): Promise<ModelConfig[]> {
  if (provider === "gemini")
    return loadGeminiModels(providerId, provider, config);
  if (provider === "ollama") return loadOllamaModels(providerId, config);
  if (provider === "anthropic")
    return loadAnthropicModels(providerId, provider, config);
  return loadOpenAICompatibleModels(providerId, provider, config);
}

async function loadGeminiModels(
  providerId: string,
  provider: ProviderId,
  config: ProviderConfig,
) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(config.apiKey || "")}`,
  );
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return (data.models || [])
    .filter(
      (model: { name?: string; supportedGenerationMethods?: string[] }) =>
        model.name &&
        model.supportedGenerationMethods?.includes("generateContent"),
    )
    .map((model: { name: string; displayName?: string }) => {
      const name = model.name.replace(/^models\//, "");
      return {
        id: `${providerId}:${name}`,
        name,
        displayName: `${config.label || providerLabels[provider]} / ${model.displayName || name}`,
        contextLength: readContextLength(model),
      };
    });
}

async function loadOpenAICompatibleModels(
  providerId: string,
  provider: ProviderId,
  config: ProviderConfig,
) {
  const baseUrl = (
    config.baseUrl ||
    providerDefaultBaseUrls[provider] ||
    ""
  ).replace(/\/$/, "");
  if (!baseUrl) throw new Error("Base URL is required");
  const response = await fetch(`${baseUrl}/models`, {
    headers: config.apiKey
      ? { Authorization: `Bearer ${config.apiKey}` }
      : undefined,
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return (data.data || data.models || [])
    .map((model: string | { id?: string; name?: string }) => {
      const name = typeof model === "string" ? model : model.id || model.name;
      return name
        ? {
            id: `${providerId}:${name}`,
            name,
            displayName: `${config.label || providerLabels[provider]} / ${name}`,
            contextLength: readContextLength(model),
          }
        : undefined;
    })
    .filter(Boolean) as ModelConfig[];
}

async function loadAnthropicModels(
  providerId: string,
  provider: ProviderId,
  config: ProviderConfig,
) {
  const baseUrl = (
    config.baseUrl ||
    providerDefaultBaseUrls[provider] ||
    ""
  ).replace(/\/$/, "");
  if (!baseUrl) throw new Error("Base URL is required");
  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      "anthropic-version": "2023-06-01",
      ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return (data.data || data.models || [])
    .map(
      (
        model: string | { id?: string; display_name?: string; name?: string },
      ) => ({
        id: typeof model === "string" ? model : model.id || model.name || "",
        label:
          typeof model === "string"
            ? model
            : model.display_name || model.id || model.name || "",
      }),
    )
    .filter((model: { id: string }) => model.id)
    .map((model: { id: string; label: string }) => ({
      id: `${providerId}:${model.id}`,
      name: model.id,
      displayName: `${config.label || providerLabels[provider]} / ${model.label}`,
      contextLength: readContextLength(model),
    }));
}

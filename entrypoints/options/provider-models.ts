import { readContextLength } from "../../src/shared/model-context";
import {
  modelDisplayName,
  providerDisplayName,
} from "../../src/shared/model-display";
import type { ModelConfig, ProviderConfig } from "../../src/shared/types";
import { providerType, type ProviderId } from "../../src/shared/providers";
import {
  normalizeBaseUrl,
  providerApiBase,
} from "../../src/shared/provider-urls";
import { USER_ERROR_CODE, UserError } from "../../src/shared/user-errors";

export async function loadProviderModels(
  providerId: string,
  provider: ProviderId,
  config: ProviderConfig,
): Promise<ModelConfig[]> {
  const { api } = providerType(provider);
  if (api === "google-generative-ai")
    return loadGeminiModels(providerId, provider, config);
  // Ollama lists its models in its own API.
  if (provider === "ollama") return loadOllamaModels(providerId, config);
  if (api === "anthropic-messages")
    return loadAnthropicModels(providerId, provider, config);
  return loadOpenAICompatibleModels(providerId, provider, config);
}

async function loadGeminiModels(
  providerId: string,
  provider: ProviderId,
  config: ProviderConfig,
) {
  const response = await fetch(
    `${providerType(provider).sdkEndpoint}/v1beta/models?key=${encodeURIComponent(config.apiKey || "")}`,
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
      return listedModel(providerId, config, provider, name, {
        label: model.displayName,
        contextLength: readContextLength(model),
      });
    });
}

async function loadOpenAICompatibleModels(
  providerId: string,
  provider: ProviderId,
  config: ProviderConfig,
) {
  const baseUrl = providerApiBase(provider, config.baseUrl);
  if (!baseUrl)
    throw new UserError(
      USER_ERROR_CODE.baseUrlRequired,
      "Base URL is required",
    );
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
        ? listedModel(providerId, config, provider, name, {
            contextLength: readContextLength(model),
          })
        : undefined;
    })
    .filter(Boolean) as ModelConfig[];
}

async function loadAnthropicModels(
  providerId: string,
  provider: ProviderId,
  config: ProviderConfig,
) {
  const baseUrl = providerApiBase(provider, config.baseUrl);
  if (!baseUrl)
    throw new UserError(
      USER_ERROR_CODE.baseUrlRequired,
      "Base URL is required",
    );
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
    .map((model: { id: string; label: string }) =>
      listedModel(providerId, config, provider, model.id, {
        label: model.label,
        contextLength: readContextLength(model),
      }),
    );
}

// A model a provider lists, named "<provider> / <label>".
export function listedModel(
  providerId: string,
  config: ProviderConfig,
  type: ProviderId,
  name: string,
  { label, contextLength }: { label?: string; contextLength?: number } = {},
): ModelConfig {
  return {
    id: `${providerId}:${name}`,
    name,
    displayName: modelDisplayName(
      providerDisplayName({ ...config, type }),
      label || name,
    ),
    ...(contextLength ? { contextLength } : {}),
  };
}

async function loadOllamaModels(
  providerId: string,
  config: ProviderConfig,
): Promise<ModelConfig[]> {
  // Ollama's own API, beside the OpenAI one under /v1.
  const baseUrl = normalizeBaseUrl(
    config.baseUrl || providerType("ollama").defaultBaseUrl || "",
  );
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return (data.models || [])
    .map((model: { name?: string }) => model.name)
    .filter(Boolean)
    .map((name: string) => listedModel(providerId, config, "ollama", name));
}

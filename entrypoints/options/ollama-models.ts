import {
  providerDefaultBaseUrls,
  providerLabels,
  type ModelConfig,
  type ProviderConfig,
} from "../../src/shared/types";

export async function loadOllamaModels(
  providerId: string,
  config: ProviderConfig,
): Promise<ModelConfig[]> {
  const baseUrl = (
    config.baseUrl ||
    providerDefaultBaseUrls.ollama ||
    ""
  ).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return (data.models || [])
    .map((model: { name?: string }) => model.name)
    .filter(Boolean)
    .map((name: string) => ({
      id: `${providerId}:${name}`,
      name,
      displayName: `${config.label || providerLabels.ollama} / ${name}`,
    }));
}

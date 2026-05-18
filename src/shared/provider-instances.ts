import {
  providerDefaultBaseUrls,
  providerLabels,
  type ProviderConfig,
  type ProviderId,
  type ProviderState,
} from "./types";

export const PROVIDER_TYPES: ProviderId[] = [
  "openai",
  "ollama",
  "gemini",
  "deepseek",
  "openrouter",
  "aihubmix",
  "glm",
  "aigateway",
  "minimax",
];

export const MANUAL_MODEL_PROVIDER_TYPES: ProviderId[] = ["openai", "minimax"];

export function normalizeProviderState(state: ProviderState = {}) {
  return Object.fromEntries(
    Object.entries(state).map(([id, config]) => [
      id,
      normalizeProviderConfig(id, config),
    ]),
  );
}

export function normalizeProviderConfig(id: string, config: ProviderConfig) {
  const type = providerTypeFromId(id, config.type);
  return {
    ...config,
    id,
    type,
    label: config.label || providerLabels[type] || id,
    baseUrl: config.baseUrl || providerDefaultBaseUrls[type],
  };
}

export function createProviderConfig(
  type: ProviderId,
  existing: ProviderState,
) {
  const id = uniqueProviderId(type, existing);
  return normalizeProviderConfig(id, { id, type, models: [] });
}

export function providerTypeFromId(id: string, type?: ProviderId) {
  if (type) return type;
  return PROVIDER_TYPES.includes(id as ProviderId)
    ? (id as ProviderId)
    : "openai";
}

function uniqueProviderId(type: ProviderId, existing: ProviderState) {
  if (!existing[type]) return type;
  let index = 2;
  while (existing[`${type}-${index}`]) index += 1;
  return `${type}-${index}`;
}

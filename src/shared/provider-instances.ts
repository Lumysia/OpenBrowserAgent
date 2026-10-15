import { isProviderId, providerType, type ProviderId } from "./providers";
import type { ProviderConfig, ProviderState } from "./types";

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
    label: config.label || providerType(type).label,
    baseUrl: config.baseUrl || providerType(type).defaultBaseUrl,
    imageModels: config.imageModels || [],
  };
}

export function createProviderConfig(
  type: ProviderId,
  existing: ProviderState,
) {
  const id = uniqueProviderId(type, existing);
  return normalizeProviderConfig(id, { id, type, models: [], imageModels: [] });
}

export function providerTypeFromId(id: string, type?: ProviderId) {
  if (type) return type;
  return isProviderId(id) ? id : "openai";
}

function uniqueProviderId(type: ProviderId, existing: ProviderState) {
  if (!existing[type]) return type;
  let index = 2;
  while (existing[`${type}-${index}`]) index += 1;
  return `${type}-${index}`;
}

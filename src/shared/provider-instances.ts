import { isProviderId, providerType, type ProviderId } from "./providers";
import { sameJson } from "./sync/codec";
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
  return newProviderConfig(uniqueProviderId(type, existing), type);
}

function newProviderConfig(id: string, type: ProviderId) {
  return normalizeProviderConfig(id, { id, type, models: [], imageModels: [] });
}

// Whether a provider is still as createProviderConfig made it: no key,
// model, permission or other setting, its label and base URL the type's.
// Blank text and empty lists count as unset.
export function providerUntouched(id: string, provider: ProviderConfig) {
  const config = normalizeProviderConfig(id, provider);
  return sameJson(
    setFields(config),
    setFields(newProviderConfig(id, config.type)),
  );
}

function setFields(config: ProviderConfig) {
  return Object.fromEntries(
    Object.entries(config).filter(
      ([, value]) =>
        value !== undefined &&
        !(typeof value === "string" && !value.trim()) &&
        !(Array.isArray(value) && !value.length),
    ),
  );
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

import type { ModelChoice } from "./model-choice";
import { providerLabels, type ModelConfig, type ProviderConfig } from "./types";

// A model's stored display name is "<provider> / <model>". With the
// provider's name known, that prefix is removed; otherwise the first
// separator splits it, as model names hold "/" more often than provider
// names (OpenRouter's "vendor/model").
const SEPARATOR = " / ";

export function modelDisplayName(provider: string, label: string) {
  return `${provider}${SEPARATOR}${label}`;
}

function splitDisplayName(displayName: string, providerName?: string) {
  const prefix = providerName && modelDisplayName(providerName, "");
  if (prefix && displayName.startsWith(prefix))
    return { provider: providerName, label: displayName.slice(prefix.length) };
  const at = displayName.indexOf(SEPARATOR);
  if (at < 0) return { label: displayName.trim() };
  return {
    provider: displayName.slice(0, at).trim() || undefined,
    label: displayName.slice(at + SEPARATOR.length),
  };
}

// The provider and model parts of a display name; the model's own name when
// the label is empty.
export function parseModelDisplayName(
  model: Pick<ModelConfig, "name" | "displayName">,
  providerName?: string,
): { provider?: string; label: string } {
  const { provider, label } = splitDisplayName(
    model.displayName || "",
    providerName,
  );
  return { provider, label: label.trim() || model.name };
}

// The label as the user typed it, for editing (it may be empty).
export function editableModelLabel(
  model: Pick<ModelConfig, "name" | "displayName">,
  providerName: string,
) {
  if (!model.displayName) return model.name;
  return splitDisplayName(model.displayName, providerName).label;
}

// Model ids are "<provider key>:<model name>".
export function modelIdParts(modelId: string) {
  const at = modelId.indexOf(":");
  return at < 0
    ? { providerKey: modelId, name: modelId }
    : { providerKey: modelId.slice(0, at), name: modelId.slice(at + 1) };
}

// The name a provider's models are labelled with.
export function providerDisplayName(provider: ProviderConfig) {
  return provider.label || providerLabels[provider.type || "openai"];
}

// The provider and model names of a chosen model, as stored with an answer.
export function modelChoiceLabel({ provider, model }: ModelChoice) {
  const parsed = parseModelDisplayName(model, providerDisplayName(provider));
  return {
    provider: parsed.provider || providerDisplayName(provider),
    name: parsed.label,
  };
}

import {
  providerLabels,
  type ModelConfig,
  type ProviderConfig,
} from "../../src/shared/types";

// Edits of a provider in its settings form. Display names of models are
// "<provider name> / <model label>"; they change only with what the user
// edits (adding a model, renaming the provider), never on save, so a save
// changes no model the user left alone.

const providerName = (provider: ProviderConfig) =>
  provider.label || providerLabels[provider.type || "openai"];

// Renaming the provider renames the models named after it.
export function renameProviderDraft(value: ProviderConfig, label: string) {
  const next = { ...value, label };
  const from = `${providerName(value)} / `;
  const to = `${providerName(next)} / `;
  if (from === to) return next;
  return {
    ...next,
    models: value.models?.map((model) =>
      model.displayName?.startsWith(from)
        ? { ...model, displayName: to + model.displayName.slice(from.length) }
        : model,
    ),
  };
}

// A model added to the provider, named after it.
export function modelWithProviderLabel(
  model: ModelConfig,
  provider: ProviderConfig,
) {
  const modelLabel = model.displayName?.split("/").slice(1).join("/").trim();
  return {
    ...model,
    displayName: `${providerName(provider)} / ${modelLabel || model.name}`,
  };
}

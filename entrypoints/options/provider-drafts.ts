import {
  modelDisplayName,
  parseModelDisplayName,
  providerDisplayName,
} from "../../src/shared/model-display";
import type { ModelConfig, ProviderConfig } from "../../src/shared/types";

// Edits of a provider in its settings form. Display names of models are
// "<provider name> / <model label>"; they change only with what the user
// edits (adding a model, renaming the provider), never on save, so a save
// changes no model the user left alone.

// Renaming the provider renames the models named after it.
export function renameProviderDraft(value: ProviderConfig, label: string) {
  const next = { ...value, label };
  const from = providerDisplayName(value);
  const to = providerDisplayName(next);
  if (from === to) return next;
  return {
    ...next,
    models: value.models?.map((model) => {
      const { provider, label } = parseModelDisplayName(model, from);
      return provider === from
        ? { ...model, displayName: modelDisplayName(to, label) }
        : model;
    }),
  };
}

// A model added to the provider, named after it.
export function modelWithProviderLabel(
  model: ModelConfig,
  provider: ProviderConfig,
) {
  return {
    ...model,
    displayName: modelDisplayName(
      providerDisplayName(provider),
      parseModelDisplayName(model, providerDisplayName(provider)).label,
    ),
  };
}

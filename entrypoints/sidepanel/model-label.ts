import {
  providerLabels,
  type Agent,
  type ModelConfig,
  type Preferences,
} from "../../src/shared/types";

// The model a chat message runs with: the agent's own while it still exists
// (as in the background's resolveModel), else the selected one.
export function chatModelLabel(
  agent: Agent,
  preferences: Preferences | undefined,
  models: ModelConfig[],
) {
  return assistantModelLabel({
    modelId: models.some((model) => model.id === agent.modelId)
      ? agent.modelId
      : preferences?.selectedModelId,
    models,
  });
}

export function assistantModelLabel({
  modelId,
  models,
}: {
  modelId?: string;
  models: ModelConfig[];
}) {
  const model = models.find((candidate) => candidate.id === modelId);
  if (!model && !modelId) return undefined;
  const displayName = model?.displayName || "";
  const providerId = String(model?.id || modelId || "").split(
    ":",
  )[0] as keyof typeof providerLabels;
  const provider =
    displayName.split("/")[0]?.trim() ||
    providerLabels[providerId] ||
    providerId;
  const name = stripProviderPrefix(
    displayName || model?.name || String(modelId || ""),
    provider,
  );
  return {
    provider,
    name,
  };
}

function stripProviderPrefix(name: string, provider: string) {
  const escapedProvider = provider.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return name
    .replace(new RegExp(`^${escapedProvider}\\s*[/·:-]\\s*`, "i"), "")
    .trim();
}

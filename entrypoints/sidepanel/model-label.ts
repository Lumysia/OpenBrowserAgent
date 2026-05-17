import { providerLabels, type ModelConfig } from "../../src/shared/types";

export function assistantModelLabel({
  modelId,
  models,
}: {
  modelId?: string;
  models: ModelConfig[];
}) {
  const model = models.find((candidate) => candidate.id === modelId);
  if (!model && !modelId) return undefined;
  const providerId = String(model?.id || modelId || "").split(
    ":",
  )[0] as keyof typeof providerLabels;
  return {
    provider: providerLabels[providerId] || providerId,
    name: model?.displayName || model?.name || String(modelId || ""),
  };
}

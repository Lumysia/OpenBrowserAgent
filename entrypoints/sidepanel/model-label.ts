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

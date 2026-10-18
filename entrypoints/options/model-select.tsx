import { useCallback, useMemo } from "react";
import type { Messages } from "../../src/shared/i18n";
import { configuredModels, namedModel } from "../../src/shared/model-choice";
import { roleModels, type ModelRole } from "../../src/shared/model-roles";
import { storage } from "../../src/shared/storage";
import type { ModelConfig } from "../../src/shared/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/ui/components";
import { modelNameDisplay } from "../../src/ui/provider-display";
import { useStoredState } from "../../src/ui/useStoredState";

// Select value for "no model": the setting stays unset.
const NO_MODEL = "no-model";

// A configured model, or none (shown as `noneLabel`: a default such as the
// chat's model, or a prompt to pick one). `unavailableReason`: why the choice
// can't be changed now; the stored choice stays as it is.
export function ModelSelect({
  t,
  models,
  value: modelId,
  noneLabel,
  label,
  disabled,
  unavailableReason,
  onChange,
}: {
  t: Messages;
  models: ModelConfig[];
  value: string | undefined;
  noneLabel: string;
  label: string;
  disabled?: boolean;
  unavailableReason?: string;
  onChange: (modelId: string | undefined) => void;
}) {
  // A choice naming none of `models` reads as none, as the feature then
  // uses none of them.
  const value = namedModel(models, modelId)?.id;
  return (
    <Select
      value={value || NO_MODEL}
      disabled={!unavailableReason && (disabled || models.length === 0)}
      onValueChange={(next) => onChange(next === NO_MODEL ? undefined : next)}
    >
      <SelectTrigger aria-label={label} unavailableReason={unavailableReason}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_MODEL}>{noneLabel}</SelectItem>
        {models.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            {modelNameDisplay(model, t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function useConfiguredModels() {
  const [providers] = useStoredState(storage.provider);
  return useMemo(() => configuredModels(providers), [providers]);
}

// The configured models each feature can use.
export function useRoleModels() {
  const [providers] = useStoredState(storage.provider);
  return useCallback(
    (role: ModelRole) => roleModels(role, providers),
    [providers],
  );
}

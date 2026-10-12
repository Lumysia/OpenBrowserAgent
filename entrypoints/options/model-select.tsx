import { normalizeProviderState } from "../../src/shared/provider-instances";
import { storage } from "../../src/shared/storage";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

// Select value for "no model of its own"; stored as an empty id.
const DEFAULT_MODEL = "default-model";

// A configured chat model, or the default named by `defaultLabel`.
export function ModelSelect({
  value,
  defaultLabel,
  label,
  disabled,
  onChange,
}: {
  value: string | undefined;
  defaultLabel: string;
  label: string;
  disabled?: boolean;
  onChange: (modelId: string) => void;
}) {
  const [providers] = useStoredState(storage.provider);
  const models = Object.values(normalizeProviderState(providers || {})).flatMap(
    (provider) =>
      (provider.models || []).map((model) => ({
        id: model.id,
        label: [model.displayName || model.name, provider.label]
          .filter(Boolean)
          .join(" · "),
      })),
  );
  return (
    <Select
      value={value || DEFAULT_MODEL}
      disabled={disabled}
      onValueChange={(next) => onChange(next === DEFAULT_MODEL ? "" : next)}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_MODEL}>{defaultLabel}</SelectItem>
        {models.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            {model.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

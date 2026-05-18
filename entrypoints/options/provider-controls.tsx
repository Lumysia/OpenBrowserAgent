import { Check, ChevronDown, Trash2 } from "lucide-react";
import { useState } from "react";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import type { ModelConfig, ProviderConfig } from "../../src/shared/types";
import {
  Button,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function FetchedModelPicker({
  t,
  search,
  selectedId,
  models,
  onSearch,
  onSelect,
  onAdd,
}: {
  t: ReturnType<typeof getMessages>;
  search: string;
  selectedId: string;
  models: ModelConfig[];
  onSearch: (value: string) => void;
  onSelect: (value: string) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedModel = models.find((model) => model.id === selectedId);
  const emptyText = models.length
    ? t.options.selectFetchedModel
    : search
      ? t.options.noFetchedModelsMatch
      : t.options.allFetchedModelsAdded;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="fetched-model-trigger"
            type="button"
          >
            <span>{selectedModel?.displayName || emptyText}</span>
            <ChevronDown size={16} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="fetched-model-popover" align="start">
          <Input
            value={search}
            placeholder={t.options.searchFetchedModels}
            onChange={(event) => onSearch(event.target.value)}
          />
          <div className="fetched-model-list">
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                className="fetched-model-option"
                onClick={() => {
                  onSelect(model.id);
                  setOpen(false);
                }}
              >
                <span>{model.displayName || model.name}</span>
                {selectedId === model.id && <Check size={14} />}
              </button>
            ))}
            {!models.length && <p className="muted">{emptyText}</p>}
          </div>
        </PopoverContent>
      </Popover>
      <Button
        onClick={onAdd}
        disabled={
          !selectedId || !models.some((model) => model.id === selectedId)
        }
      >
        {t.options.addSelected}
      </Button>
    </>
  );
}

export function ModelSelect({
  label,
  value,
  models,
  emptyLabel,
  disabled,
  onChange,
}: {
  label: string;
  value?: string;
  models: ModelConfig[];
  emptyLabel: string;
  disabled?: boolean;
  onChange: (value?: string) => void;
}) {
  return (
    <Label>
      {label}
      <Select
        value={value || "none"}
        disabled={disabled}
        onValueChange={(next) => onChange(next === "none" ? undefined : next)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{emptyLabel}</SelectItem>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.displayName || model.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Label>
  );
}

export function ModelList({
  models,
  value,
  modelKey = "models",
  onChange,
}: {
  models: ModelConfig[];
  value: ProviderConfig;
  modelKey?: "models" | "imageModels";
  onChange: (value: ProviderConfig) => void;
}) {
  const [language] = useStoredState(storage.language);
  const t = getMessages(language);
  return (
    <div className="model-table">
      {models.map((model) => (
        <div className="model-row" key={model.id}>
          <span>{model.displayName || model.name}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              onChange({
                ...value,
                [modelKey]: models.filter(
                  (candidate) => candidate.id !== model.id,
                ),
              })
            }
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
      {!models.length && <p className="muted">{t.options.noModelsAddedYet}</p>}
    </div>
  );
}

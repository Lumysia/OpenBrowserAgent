import { Check, ChevronDown, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import {
  providerLabels,
  type ModelConfig,
  type ProviderConfig,
} from "../../src/shared/types";
import {
  Button,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
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
            className="ui-combobox-trigger"
            type="button"
          >
            <span>{selectedModel?.displayName || emptyText}</span>
            <ChevronDown size={16} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="ui-combobox-popover" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              placeholder={t.options.searchFetchedModels}
              onValueChange={onSearch}
            />
            <CommandList>
              {models.map((model) => (
                <CommandItem
                  key={model.id}
                  value={model.id}
                  onSelect={() => {
                    onSelect(model.id);
                    setOpen(false);
                  }}
                >
                  <span>{model.displayName || model.name}</span>
                  {selectedId === model.id && <Check size={14} />}
                </CommandItem>
              ))}
              {!models.length && <CommandEmpty>{emptyText}</CommandEmpty>}
            </CommandList>
          </Command>
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
  const isDisabled = disabled || models.length === 0;

  return (
    <Label>
      {label}
      <Select
        value={value || "none"}
        disabled={isDisabled}
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
  testingModelId,
  testResult,
  onTestModel,
  onChange,
}: {
  models: ModelConfig[];
  value: ProviderConfig;
  modelKey?: "models" | "imageModels";
  testingModelId?: string;
  testResult?: { modelId: string; ok: boolean; message: string };
  onTestModel?: (model: ModelConfig) => void;
  onChange: (value: ProviderConfig) => void;
}) {
  const [language] = useStoredState(storage.language);
  const t = getMessages(language);
  return (
    <div className="model-table">
      {models.map((model) => (
        <div className="model-row" key={model.id}>
          <div className="model-row-main">
            <Input
              className="model-display-input"
              value={modelDisplayLabel(model)}
              onChange={(event) =>
                onChange({
                  ...value,
                  [modelKey]: models.map((candidate) =>
                    candidate.id === model.id
                      ? renameModelDisplayName(
                          candidate,
                          value,
                          event.target.value,
                        )
                      : candidate,
                  ),
                })
              }
            />
            <small className="model-api-name">
              {modelTechnicalLabel(value, model)}
            </small>
            {testResult?.modelId === model.id && (
              <small
                className={
                  testResult.ok
                    ? "provider-success-text"
                    : "provider-error-text"
                }
              >
                {testResult.message}
              </small>
            )}
          </div>
          <div className="model-row-actions">
            {onTestModel && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onTestModel(model)}
                disabled={testingModelId === model.id}
              >
                {testingModelId === model.id ? (
                  <Loader2 size={14} className="spin" />
                ) : null}
                {testingModelId === model.id
                  ? t.options.testingModel
                  : t.options.testModel}
              </Button>
            )}
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
        </div>
      ))}
      {!models.length && <p className="muted">{t.options.noModelsAddedYet}</p>}
    </div>
  );
}

function modelDisplayLabel(model: ModelConfig) {
  const fromDisplay = model.displayName?.split("/").slice(1).join("/").trim();
  return fromDisplay ?? model.name;
}

function modelTechnicalLabel(provider: ProviderConfig, model: ModelConfig) {
  return `${providerDisplayName(provider)} / ${model.name}`;
}

function renameModelDisplayName(
  model: ModelConfig,
  provider: ProviderConfig,
  label: string,
) {
  return {
    ...model,
    displayName: `${providerDisplayName(provider)} / ${label}`,
  };
}

function providerDisplayName(provider: ProviderConfig) {
  return provider.label || providerLabels[provider.type || "openai"];
}

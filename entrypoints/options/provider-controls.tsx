import { Check, ChevronDown, Trash2 } from "lucide-react";
import { useState } from "react";
import { getMessages } from "../../src/shared/i18n";
import {
  editableModelLabel,
  modelDisplayName,
  parseModelDisplayName,
  providerDisplayName,
} from "../../src/shared/model-display";
import { storage } from "../../src/shared/storage";
import { type ModelConfig, type ProviderConfig } from "../../src/shared/types";
import {
  Accordion,
  Button,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Input,
  Feedback,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  IconTooltip,
  SettingsAccordionItem,
  TestButton,
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
            <span>
              {selectedModel ? fetchedModelLabel(selectedModel) : emptyText}
            </span>
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
                  <span>{fetchedModelLabel(model)}</span>
                  {selectedId === model.id && <Check size={14} />}
                </CommandItem>
              ))}
              {!models.length && <CommandEmpty>{emptyText}</CommandEmpty>}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        className="provider-add-selected-button"
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

function fetchedModelLabel(model: ModelConfig) {
  return parseModelDisplayName(model).label;
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
    <Accordion type="multiple" className="model-table model-accordion">
      {models.map((model) => (
        <SettingsAccordionItem
          key={model.id}
          value={model.id}
          className="model-row"
          headerClassName="model-row-header"
          triggerClassName="model-row-trigger"
          actionsClassName="model-row-actions"
          contentClassName="model-row-content"
          chevronLabel={t.options.configuredModels}
          summary={
            <span className="model-row-summary">
              <span className="model-row-title">
                {parseModelDisplayName(model, providerDisplayName(value)).label}
              </span>
              <small className="model-api-name">
                {modelTechnicalLabel(value, model)}
              </small>
            </span>
          }
          actions={
            <>
              {onTestModel && (
                <TestButton
                  state={
                    testingModelId === model.id
                      ? "testing"
                      : testResult?.modelId === model.id && testResult.ok
                        ? "done"
                        : "idle"
                  }
                  label={t.options.testModel}
                  testingLabel={t.options.testingModel}
                  onClick={() => onTestModel(model)}
                />
              )}
              <IconTooltip label={t.common.delete}>
                <Button
                  variant="destructiveOutline"
                  size="icon"
                  aria-label={t.common.delete}
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
              </IconTooltip>
            </>
          }
        >
          <div className="model-row-main">
            <Label>
              {t.options.modelDisplayName}
              <Input
                className="model-display-input"
                value={editableModelLabel(model, providerDisplayName(value))}
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
            </Label>
            <Label>
              {t.options.modelContextLength}
              <Input
                inputMode="numeric"
                placeholder={t.options.modelContextLengthAuto}
                value={model.contextLength ? String(model.contextLength) : ""}
                onChange={(event) =>
                  onChange({
                    ...value,
                    [modelKey]: models.map((candidate) =>
                      candidate.id === model.id
                        ? withModelContextLength(candidate, event.target.value)
                        : candidate,
                    ),
                  })
                }
              />
            </Label>
            <small className="model-api-name">
              {t.options.modelContextLengthDescription}
            </small>
            {testResult?.modelId === model.id && (
              <Feedback
                error={!testResult.ok}
                className={
                  testResult.ok
                    ? "provider-success-text"
                    : "provider-error-text"
                }
              >
                {testResult.message}
              </Feedback>
            )}
          </div>
        </SettingsAccordionItem>
      ))}
      {!models.length && <p className="muted">{t.options.noModelsAddedYet}</p>}
    </Accordion>
  );
}

function withModelContextLength(
  model: ModelConfig,
  value: string,
): ModelConfig {
  const contextLength = Number.parseInt(value, 10);
  if (!Number.isFinite(contextLength) || contextLength <= 0) {
    const { contextLength: _contextLength, ...rest } = model;
    return rest;
  }
  return { ...model, contextLength };
}

function modelTechnicalLabel(provider: ProviderConfig, model: ModelConfig) {
  return modelDisplayName(providerDisplayName(provider), model.name);
}

function renameModelDisplayName(
  model: ModelConfig,
  provider: ProviderConfig,
  label: string,
) {
  return {
    ...model,
    displayName: modelDisplayName(providerDisplayName(provider), label),
  };
}

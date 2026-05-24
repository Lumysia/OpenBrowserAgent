import {
  Check,
  ChevronDown,
  FlaskConical,
  Loader2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import {
  providerLabels,
  type ModelConfig,
  type ProviderConfig,
} from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTriggerButton,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
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
  return model.displayName?.split("/").slice(1).join("/").trim() || model.name;
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
    <Accordion type="multiple" className="model-table model-accordion">
      {models.map((model) => (
        <AccordionItem className="model-row" key={model.id} value={model.id}>
          <AccordionHeader className="ui-accordion-header-with-actions model-row-header">
            <AccordionTriggerButton hideChevron className="model-row-trigger">
              <span className="model-row-summary">
                <span className="model-row-title">
                  {modelDisplayLabel(model)}
                </span>
                <small className="model-api-name">
                  {modelTechnicalLabel(value, model)}
                </small>
              </span>
            </AccordionTriggerButton>
            <span
              className="accordion-trigger-actions model-row-actions"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {onTestModel && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="tooltip-button-wrapper">
                      <Button
                        size="icon"
                        aria-label={
                          testingModelId === model.id
                            ? t.options.testingModel
                            : t.options.testModel
                        }
                        onClick={() => onTestModel(model)}
                        disabled={testingModelId === model.id}
                      >
                        {testingModelId === model.id ? (
                          <Loader2 size={14} className="spin" />
                        ) : (
                          <FlaskConical size={14} />
                        )}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {testingModelId === model.id
                      ? t.options.testingModel
                      : t.options.testModel}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="tooltip-button-wrapper">
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
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t.common.delete}</TooltipContent>
              </Tooltip>
            </span>
            <AccordionTriggerButton
              className="accordion-chevron-trigger"
              aria-label={t.options.configuredModels}
            />
          </AccordionHeader>
          <AccordionContent className="model-row-content">
            <div className="model-row-main">
              <Label>
                {t.options.modelDisplayName}
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
                          ? withModelContextLength(
                              candidate,
                              event.target.value,
                            )
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
          </AccordionContent>
        </AccordionItem>
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

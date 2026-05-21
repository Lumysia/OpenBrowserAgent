import { useEffect, useState } from "react";
import { Cpu, Loader2, Plus, Server, Trash2 } from "lucide-react";
import { QUICK_FEEDBACK_MS } from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { MANUAL_MODEL_PROVIDER_TYPES } from "../../src/shared/provider-instances";
import { storage } from "../../src/shared/storage";
import {
  providerDefaultBaseUrls,
  providerLabels,
  type ModelConfig,
  type ProviderConfig,
  type ProviderId,
} from "../../src/shared/types";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { FetchedModelPicker, ModelList } from "./provider-controls";
import { loadProviderModels } from "./provider-models";
import { testProviderModel } from "./test-provider-model";

const baseUrlOptions: Partial<Record<ProviderId, string[]>> = {
  glm: ["https://api.z.ai/api/paas/v4", "https://open.bigmodel.cn/api/paas/v4"],
  minimax: ["https://api.minimax.io/v1", "https://api.minimaxi.com/v1"],
};

export function ProviderAccordion({
  providerId,
  value,
  onChange,
  onDelete,
  onModelAdded,
}: {
  providerId: string;
  value: ProviderConfig;
  onChange: (value: ProviderConfig) => void;
  onDelete: () => void;
  onModelAdded: (model: ModelConfig) => void;
}) {
  const [language] = useStoredState(storage.language);
  const [draft, setDraft] = useState(value);
  const [modelName, setModelName] = useState("");
  const [fetchedModelSearch, setFetchedModelSearch] = useState("");
  const [fetchedModels, setFetchedModels] = useState<ModelConfig[]>([]);
  const [selectedFetchedModelId, setSelectedFetchedModelId] = useState("");
  const [customModelOpen, setCustomModelOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testingModelId, setTestingModelId] = useState("");
  const [testResult, setTestResult] = useState<{
    modelId: string;
    ok: boolean;
    message: string;
  }>();
  const [error, setError] = useState("");
  const models = draft.models || [];
  const provider = draft.type || "openai";
  const t = getMessages(language);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const canAddManualModel = MANUAL_MODEL_PROVIDER_TYPES.includes(provider);
  const selectableFetchedModels = fetchedModels
    .filter((model) => !models.some((candidate) => candidate.id === model.id))
    .filter((model) =>
      `${model.name} ${model.displayName || ""}`
        .toLowerCase()
        .includes(fetchedModelSearch.toLowerCase()),
    );

  useEffect(() => {
    setDraft(value);
    setSaved(false);
  }, [providerId, value]);

  function addModel() {
    const name = modelName.trim();
    if (!name) return false;
    const model = modelWithProviderLabel(
      { id: `${providerId}:${name}`, name },
      draft,
    );
    setDraft({ ...draft, models: [...models, model] });
    setModelName("");
    return true;
  }

  function addManualModel() {
    if (addModel()) setCustomModelOpen(false);
  }

  async function fetchModels() {
    setFetching(true);
    setError("");
    try {
      const fetched = await loadProviderModels(providerId, provider, draft);
      setFetchedModels(fetched);
      setFetchedModelSearch("");
      const firstAvailable = fetched.find(
        (model) => !models.some((candidate) => candidate.id === model.id),
      );
      setSelectedFetchedModelId(firstAvailable?.id || "");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setFetching(false);
    }
  }

  function addFetchedModel() {
    const model = fetchedModels.find(
      (candidate) => candidate.id === selectedFetchedModelId,
    );
    if (!model || models.some((candidate) => candidate.id === model.id)) return;
    const nextModels = [...models, modelWithProviderLabel(model, draft)];
    setDraft({ ...draft, models: nextModels });
    const next = fetchedModels.find(
      (candidate) =>
        !nextModels.some((existing) => existing.id === candidate.id),
    );
    setSelectedFetchedModelId(next?.id || "");
  }

  function saveProvider() {
    const savedDraft = syncModelDisplayNames(draft);
    onChange(savedDraft);
    models
      .filter(
        (model) =>
          !value.models?.some((candidate) => candidate.id === model.id),
      )
      .forEach(onModelAdded);
    setSaved(true);
    window.setTimeout(() => setSaved(false), QUICK_FEEDBACK_MS);
  }

  async function testModel(model: ModelConfig) {
    setTestingModelId(model.id);
    setTestResult(undefined);
    try {
      await testProviderModel(draft, model.name || model.id);
      setTestResult({
        modelId: model.id,
        ok: true,
        message: t.options.testModelSuccess,
      });
    } catch (error) {
      setTestResult({
        modelId: model.id,
        ok: false,
        message: `${t.options.testModelError}: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setTestingModelId("");
    }
  }

  return (
    <AccordionItem value={providerId}>
      <AccordionTrigger>
        <span className="settings-section-title provider-trigger-title">
          <Server size={18} /> {value.label || providerLabels[provider]}
        </span>
        <span className="provider-summary">
          <Badge>{providerLabels[provider]}</Badge>
          <Badge>
            {models.length} {t.options.models}
          </Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="provider-editor-grid">
          <div className="provider-credentials-panel">
            <div>
              <span className="settings-section-title">
                <Server size={18} /> {t.options.providerConnection}
              </span>
              <p className="muted">{t.options.providerConnectionHint}</p>
            </div>
            <Label>
              {t.options.providerName}
              <Input
                value={draft.label ?? ""}
                placeholder={providerLabels[provider]}
                onChange={(event) =>
                  setDraft(renameProviderDraft(draft, event.target.value))
                }
              />
            </Label>
            {provider !== "ollama" && (
              <Label>
                {t.options.apiKey}
                <Input
                  type="password"
                  value={draft.apiKey || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, apiKey: event.target.value })
                  }
                />
              </Label>
            )}
            <ProviderBaseUrl
              provider={provider}
              value={draft}
              onChange={setDraft}
            />
          </div>
          <div className="provider-models-panel">
            <div>
              <span className="settings-section-title">
                <Cpu size={18} /> {t.options.models}
              </span>
              <p className="muted">{t.options.modelHint}</p>
            </div>
            <div className="provider-model-actions provider-fetched-model-actions">
              <Button
                variant="secondary"
                onClick={fetchModels}
                disabled={fetching}
              >
                {fetching ? <Loader2 size={15} className="spin" /> : null}
                {fetching ? t.options.fetchingModels : t.options.fetchModels}
              </Button>
              {fetchedModels.length > 0 && (
                <FetchedModelPicker
                  t={t}
                  search={fetchedModelSearch}
                  selectedId={selectedFetchedModelId}
                  models={selectableFetchedModels}
                  onSearch={setFetchedModelSearch}
                  onSelect={setSelectedFetchedModelId}
                  onAdd={addFetchedModel}
                />
              )}
              {canAddManualModel && (
                <Tooltip>
                  <Popover
                    open={customModelOpen}
                    onOpenChange={setCustomModelOpen}
                  >
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={t.options.addCustom}
                        >
                          <Plus size={15} />
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <PopoverContent
                      className="settings-popover-content"
                      align="end"
                    >
                      <div className="settings-popover-menu">
                        <Label>
                          {t.options.addCustomModelName}
                          <Input
                            value={modelName}
                            onChange={(event) =>
                              setModelName(event.target.value)
                            }
                            onKeyDown={(event) =>
                              event.key === "Enter" && addManualModel()
                            }
                          />
                        </Label>
                        <div className="row">
                          <Button
                            disabled={!modelName.trim()}
                            onClick={addManualModel}
                          >
                            <Plus size={15} /> {t.options.addCustom}
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <TooltipContent>{t.options.addCustom}</TooltipContent>
                </Tooltip>
              )}
            </div>
            {error && <p className="provider-error-text">{error}</p>}
            <span className="settings-field-heading">
              {t.options.configuredModels}
            </span>
            <ModelList
              models={models}
              value={draft}
              testingModelId={testingModelId}
              testResult={testResult}
              onTestModel={testModel}
              onChange={setDraft}
            />
          </div>
        </div>
        <div className="provider-form-actions">
          <Button variant="destructiveOutline" size="sm" onClick={onDelete}>
            <Trash2 size={16} /> {t.options.deleteProvider}
          </Button>
          <Button onClick={saveProvider} disabled={!dirty}>
            {saved ? t.common.saved : t.common.save}
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function renameProviderDraft(value: ProviderConfig, label: string) {
  return syncModelDisplayNames({ ...value, label });
}

function syncModelDisplayNames(value: ProviderConfig) {
  return {
    ...value,
    models: value.models?.map((model) => modelWithProviderLabel(model, value)),
  };
}

function modelWithProviderLabel(model: ModelConfig, provider: ProviderConfig) {
  const providerName =
    provider.label || providerLabels[provider.type || "openai"];
  const modelLabel = model.displayName?.split("/").slice(1).join("/").trim();
  return {
    ...model,
    displayName: `${providerName} / ${modelLabel || model.name}`,
  };
}

function ProviderBaseUrl({
  provider,
  value,
  onChange,
}: {
  provider: ProviderId;
  value: ProviderConfig;
  onChange: (value: ProviderConfig) => void;
}) {
  const [language] = useStoredState(storage.language);
  const t = getMessages(language);
  if (baseUrlOptions[provider]) {
    return (
      <Label>
        {t.options.baseUrl}
        <Select
          value={
            value.baseUrl ||
            providerDefaultBaseUrls[provider] ||
            baseUrlOptions[provider][0]
          }
          onValueChange={(baseUrl) => onChange({ ...value, baseUrl })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {baseUrlOptions[provider].map((url) => (
              <SelectItem key={url} value={url}>
                {url}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
    );
  }
  if (provider === "gemini") return null;
  return (
    <Label>
      {t.options.baseUrl}
      <Input
        value={value.baseUrl || ""}
        placeholder={providerDefaultBaseUrls[provider]}
        onChange={(event) =>
          onChange({ ...value, baseUrl: event.target.value })
        }
      />
    </Label>
  );
}

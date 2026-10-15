import { useState } from "react";
import { Cpu, Loader2, Plus, Server, Trash2 } from "lucide-react";
import { formatCount, getMessages } from "../../src/shared/i18n";
import { providerHasConsent } from "../../src/shared/provider-consent";
import type { ModelConfig, ProviderConfig } from "../../src/shared/types";
import { providerType } from "../../src/shared/providers";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Feedback,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  SettingsSubheading,
} from "../../src/ui/components";
import {
  providerNameDisplay,
  providerTypeLabel,
} from "../../src/ui/provider-display";
import { ProviderConnectionFields } from "./provider-connection-fields";
import { FetchedModelPicker, ModelList } from "./provider-controls";
import { modelWithProviderLabel, renameProviderDraft } from "./provider-drafts";
import {
  listProviderModels,
  testProviderModel,
} from "../../src/shared/provider-requests";
import { errorWithDetail } from "../../src/shared/user-errors";
import { useUiLanguage } from "../../src/ui/messages";
import { useProviderDraft } from "./use-provider-draft";

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
  const language = useUiLanguage();
  const { draft, setDraft, keyUnsaved } = useProviderDraft(
    providerId,
    value,
    onChange,
  );
  const [modelName, setModelName] = useState("");
  const [fetchedModelSearch, setFetchedModelSearch] = useState("");
  const [fetchedModels, setFetchedModels] = useState<ModelConfig[]>([]);
  const [selectedFetchedModelId, setSelectedFetchedModelId] = useState("");
  const [customModelOpen, setCustomModelOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
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
  const canAddManualModel = !!providerType(provider).manualModels;
  const selectableFetchedModels = fetchedModels
    .filter((model) => !models.some((candidate) => candidate.id === model.id))
    .filter((model) =>
      `${model.name} ${model.displayName || ""}`
        .toLowerCase()
        .includes(fetchedModelSearch.toLowerCase()),
    );

  function addModel() {
    const name = modelName.trim();
    if (!name) return false;
    const model = modelWithProviderLabel(
      { id: `${providerId}:${name}`, name },
      draft,
    );
    setDraft({ ...draft, models: [...models, model] });
    onModelAdded(model);
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
      const fetched = await listProviderModels(providerId, draft);
      setFetchedModels(fetched);
      setFetchedModelSearch("");
      const firstAvailable = fetched.find(
        (model) => !models.some((candidate) => candidate.id === model.id),
      );
      setSelectedFetchedModelId(firstAvailable?.id || "");
    } catch (error) {
      setError(errorWithDetail(t.options.fetchModelsError, error, t));
    } finally {
      setFetching(false);
    }
  }

  function addFetchedModel() {
    const model = fetchedModels.find(
      (candidate) => candidate.id === selectedFetchedModelId,
    );
    if (!model || models.some((candidate) => candidate.id === model.id)) return;
    const added = modelWithProviderLabel(model, draft);
    const nextModels = [...models, added];
    setDraft({ ...draft, models: nextModels });
    onModelAdded(added);
    const next = fetchedModels.find(
      (candidate) =>
        !nextModels.some((existing) => existing.id === candidate.id),
    );
    setSelectedFetchedModelId(next?.id || "");
  }

  async function testModel(model: ModelConfig) {
    setTestingModelId(model.id);
    setTestResult(undefined);
    try {
      await testProviderModel(providerId, draft, model.name || model.id);
      setTestResult({
        modelId: model.id,
        ok: true,
        message: t.options.testModelSuccess,
      });
    } catch (error) {
      setTestResult({
        modelId: model.id,
        ok: false,
        message: errorWithDetail(t.options.testModelError, error, t),
      });
    } finally {
      setTestingModelId("");
    }
  }

  return (
    <AccordionItem value={providerId}>
      <AccordionTrigger>
        <span className="settings-section-title provider-trigger-title">
          <Server size={18} />{" "}
          {value.label
            ? providerNameDisplay(value.label, t)
            : providerTypeLabel(provider, t)}
        </span>
        <span className="provider-summary">
          <Badge>{providerTypeLabel(provider, t)}</Badge>
          <Badge>{formatCount(t.display.counts.models, models.length)}</Badge>
          {!providerHasConsent(value) && (
            <Badge className="status-error-badge">
              {t.providerConsent.needsPermission}
            </Badge>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="provider-editor-grid">
          <div className="provider-credentials-panel">
            <SettingsSubheading
              icon={<Server />}
              title={t.options.providerConnection}
              description={t.options.providerConnectionHint}
            />
            <Label>
              {t.options.providerName}
              <Input
                value={draft.label ?? ""}
                placeholder={providerTypeLabel(provider, t)}
                onChange={(event) =>
                  setDraft(renameProviderDraft(draft, event.target.value))
                }
              />
            </Label>
            <ProviderConnectionFields
              t={t}
              saved={value}
              draft={draft}
              keyUnsaved={keyUnsaved}
              onDraftChange={setDraft}
            />
          </div>
          <div className="provider-models-panel">
            <SettingsSubheading
              icon={<Cpu />}
              title={t.options.models}
              description={t.options.modelHint}
            />
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
            {error && (
              <Feedback error className="provider-error-text">
                {error}
              </Feedback>
            )}
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
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

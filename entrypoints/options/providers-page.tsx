import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { getMessages } from "../../src/shared/i18n";
import {
  createProviderConfig,
  MANUAL_MODEL_PROVIDER_TYPES,
  normalizeProviderState,
  PROVIDER_TYPES,
} from "../../src/shared/provider-instances";
import { storage } from "../../src/shared/storage";
import {
  providerDefaultBaseUrls,
  providerLabels,
  type ModelConfig,
  type ProviderConfig,
  type ProviderId,
} from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import {
  FetchedModelPicker,
  ModelList,
  ModelSelect,
} from "./provider-controls";
import { loadProviderModels } from "./provider-models";

const baseUrlOptions: Partial<Record<ProviderId, string[]>> = {
  glm: ["https://api.z.ai/api/paas/v4", "https://open.bigmodel.cn/api/paas/v4"],
  minimax: ["https://api.minimax.io/v1", "https://api.minimaxi.com/v1"],
};

export function ProvidersPage() {
  const [language] = useStoredState(storage.language);
  const [providerState, setProviderState] = useStoredState(storage.provider);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [providerType, setProviderType] = useState<ProviderId>("openai");
  const normalizedProviders = useMemo(
    () => normalizeProviderState(providerState || {}),
    [providerState],
  );
  const providerEntries = Object.entries(normalizedProviders);
  const configuredModels = useMemo(
    () =>
      Object.values(normalizedProviders).flatMap(
        (provider) => provider?.models || [],
      ),
    [normalizedProviders],
  );
  const t = getMessages(language);

  if (!providerState || !preferences) return null;
  const currentPreferences = preferences;

  function updateProvider(providerId: string, next: ProviderConfig) {
    setProviderState({ ...normalizedProviders, [providerId]: next });
  }

  function addProvider() {
    const provider = createProviderConfig(providerType, normalizedProviders);
    setProviderState({ ...normalizedProviders, [provider.id!]: provider });
  }

  function deleteProvider(providerId: string) {
    const { [providerId]: removed, ...rest } = normalizedProviders;
    setProviderState(rest);
    if (
      removed?.models?.some(
        (model) =>
          model.id === currentPreferences.selectedModelId ||
          model.id === currentPreferences.selectedImageModelId,
      )
    )
      setPreferences({
        ...currentPreferences,
        selectedModelId: undefined,
        selectedImageModelId: undefined,
      });
  }

  return (
    <div className="stack">
      <div className="split">
        <div>
          <h1>{t.options.modelProviders}</h1>
          <p className="muted">{t.options.providerDescription}</p>
        </div>
      </div>
      <div className="grid-2">
        <ModelSelect
          label={t.options.selectModel}
          value={preferences.selectedModelId}
          models={configuredModels}
          emptyLabel={t.options.selectModel}
          onChange={(selectedModelId) =>
            setPreferences({ ...preferences, selectedModelId })
          }
        />
        <ModelSelect
          label={t.options.selectImageModel}
          value={preferences.selectedImageModelId}
          models={configuredModels}
          emptyLabel={t.options.selectImageModel}
          onChange={(selectedImageModelId) =>
            setPreferences({ ...preferences, selectedImageModelId })
          }
        />
      </div>
      <div className="row">
        <Select
          value={providerType}
          onValueChange={(value) => setProviderType(value as ProviderId)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {providerLabels[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={addProvider}>
          <Plus size={16} /> {t.sidepanel.addProvider}
        </Button>
      </div>
      <Accordion
        type="multiple"
        defaultValue={providerEntries.slice(0, 1).map(([id]) => id)}
        className="stack"
      >
        {providerEntries.map(([providerId, provider]) => (
          <ProviderAccordion
            key={providerId}
            providerId={providerId}
            value={provider}
            onChange={(next) => updateProvider(providerId, next)}
            onDelete={() => deleteProvider(providerId)}
            onModelAdded={(model) => {
              setPreferences({
                ...preferences,
                selectedModelId: preferences.selectedModelId || model.id,
                selectedImageModelId:
                  preferences.selectedImageModelId || model.id,
              });
            }}
          />
        ))}
      </Accordion>
    </div>
  );
}

function ProviderAccordion({
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
  const [modelName, setModelName] = useState("");
  const [fetchedModelSearch, setFetchedModelSearch] = useState("");
  const [fetchedModels, setFetchedModels] = useState<ModelConfig[]>([]);
  const [selectedFetchedModelId, setSelectedFetchedModelId] = useState("");
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const models = value.models || [];
  const provider = value.type || "openai";
  const t = getMessages(language);
  const canAddManualModel = MANUAL_MODEL_PROVIDER_TYPES.includes(provider);
  const selectableFetchedModels = fetchedModels
    .filter((model) => !models.some((candidate) => candidate.id === model.id))
    .filter((model) =>
      `${model.name} ${model.displayName || ""}`
        .toLowerCase()
        .includes(fetchedModelSearch.toLowerCase()),
    );

  function addModel() {
    const name = modelName.trim();
    if (!name) return;
    const model: ModelConfig = {
      id: `${providerId}:${name}`,
      name,
      displayName: `${value.label || providerLabels[provider]} / ${name}`,
    };
    onChange({ ...value, models: [...models, model] });
    onModelAdded(model);
    setModelName("");
  }

  async function fetchModels() {
    setFetching(true);
    setError("");
    try {
      const fetched = await loadProviderModels(providerId, provider, value);
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
    const nextModels = [...models, model];
    onChange({ ...value, models: nextModels });
    onModelAdded(model);
    const next = fetchedModels.find(
      (candidate) =>
        !nextModels.some((existing) => existing.id === candidate.id),
    );
    setSelectedFetchedModelId(next?.id || "");
  }

  return (
    <AccordionItem value={providerId}>
      <AccordionTrigger>
        <span>{value.label || providerLabels[provider]}</span>
        <Badge className="push-right">
          {models.length ? t.common.enabled : t.common.disabled}
        </Badge>
      </AccordionTrigger>
      <AccordionContent className="stack">
        <Label>
          {t.options.providerName}
          <Input
            value={value.label || ""}
            placeholder={providerLabels[provider]}
            onChange={(event) =>
              onChange({ ...value, label: event.target.value })
            }
          />
        </Label>
        {provider !== "ollama" && (
          <Label>
            {t.options.apiKey}
            <Input
              type="password"
              value={value.apiKey || ""}
              onChange={(event) =>
                onChange({ ...value, apiKey: event.target.value })
              }
            />
          </Label>
        )}
        <ProviderBaseUrl
          provider={provider}
          value={value}
          onChange={onChange}
        />
        <div className="row">
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 size={16} /> {t.options.deleteProvider}
          </Button>
        </div>
        <div className="stack">
          <div className="split">
            <strong>{t.options.models}</strong>
            <span className="muted">{t.options.modelHint}</span>
          </div>
          <div className="row">
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
          </div>
          {canAddManualModel && (
            <div className="row">
              <Input
                value={modelName}
                placeholder={t.options.addCustomModelName}
                onChange={(event) => setModelName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addModel()}
              />
              <Button variant="secondary" onClick={addModel}>
                {t.options.addCustom}
              </Button>
            </div>
          )}
          {error && (
            <p className="muted" style={{ color: "var(--destructive)" }}>
              {error}
            </p>
          )}
          <ModelList models={models} value={value} onChange={onChange} />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
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

import { useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { getMessages } from "../../src/shared/i18n";
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

const providers: ProviderId[] = [
  "openai",
  "ollama",
  "gemini",
  "deepseek",
  "openrouter",
  "aihubmix",
  "glm",
  "aigateway",
  "minimax",
];

const baseUrlOptions: Partial<Record<ProviderId, string[]>> = {
  glm: ["https://api.z.ai/api/paas/v4", "https://open.bigmodel.cn/api/paas/v4"],
  minimax: ["https://api.minimax.io/v1", "https://api.minimaxi.com/v1"],
};

const manualModelProviders: ProviderId[] = ["openai", "minimax"];

export function ProvidersPage() {
  const [language] = useStoredState(storage.language);
  const [providerState, setProviderState] = useStoredState(storage.provider);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const configuredModels = useMemo(
    () =>
      Object.values(providerState || {}).flatMap(
        (provider) => provider?.models || [],
      ),
    [providerState],
  );
  const t = getMessages(language);

  if (!providerState || !preferences) return null;

  function updateProvider(provider: ProviderId, next: ProviderConfig) {
    setProviderState({ ...providerState, [provider]: next });
  }

  return (
    <div className="stack">
      <div className="split">
        <div>
          <h1>{t.options.modelProviders}</h1>
          <p className="muted">{t.options.providerDescription}</p>
        </div>
        <Label style={{ width: 260 }}>
          {t.options.selectModel}
          <Select
            value={preferences.selectedModelId || "none"}
            onValueChange={(value) =>
              setPreferences({
                ...preferences,
                selectedModelId: value === "none" ? undefined : value,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t.options.selectModel}</SelectItem>
              {configuredModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.displayName || model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
      </div>
      <Accordion
        type="multiple"
        defaultValue={providers.slice(0, 1)}
        className="stack"
      >
        {providers.map((provider) => (
          <ProviderAccordion
            key={provider}
            provider={provider}
            value={
              providerState[provider] || {
                baseUrl: providerDefaultBaseUrls[provider],
                models: [],
              }
            }
            onChange={(next) => updateProvider(provider, next)}
            onModelAdded={(model) => {
              if (!preferences.selectedModelId)
                setPreferences({ ...preferences, selectedModelId: model.id });
            }}
          />
        ))}
      </Accordion>
    </div>
  );
}

function ProviderAccordion({
  provider,
  value,
  onChange,
  onModelAdded,
}: {
  provider: ProviderId;
  value: ProviderConfig;
  onChange: (value: ProviderConfig) => void;
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
  const t = getMessages(language);
  const canAddManualModel = manualModelProviders.includes(provider);
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
      id: `${provider}:${name}`,
      name,
      displayName: `${providerLabels[provider]} / ${name}`,
    };
    onChange({ ...value, models: [...models, model] });
    onModelAdded(model);
    setModelName("");
  }

  async function fetchModels() {
    setFetching(true);
    setError("");
    try {
      const fetched = await loadProviderModels(provider, value);
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
    <AccordionItem value={provider}>
      <AccordionTrigger>
        <span>{providerLabels[provider]}</span>
        <Badge className="push-right">
          {models.length ? t.common.enabled : t.common.disabled}
        </Badge>
      </AccordionTrigger>
      <AccordionContent className="stack">
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

function FetchedModelPicker({
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
  return (
    <>
      <Input
        value={search}
        placeholder={t.options.searchFetchedModels}
        onChange={(event) => onSearch(event.target.value)}
      />
      <Select
        value={selectedId || "none"}
        onValueChange={(value) => onSelect(value === "none" ? "" : value)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            {models.length
              ? t.options.selectFetchedModel
              : search
                ? t.options.noFetchedModelsMatch
                : t.options.allFetchedModelsAdded}
          </SelectItem>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.displayName || model.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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

function ModelList({
  models,
  value,
  onChange,
}: {
  models: ModelConfig[];
  value: ProviderConfig;
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
                models: models.filter((candidate) => candidate.id !== model.id),
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

async function loadProviderModels(
  provider: ProviderId,
  config: ProviderConfig,
): Promise<ModelConfig[]> {
  if (provider === "gemini") return loadGeminiModels(provider, config);
  if (provider === "ollama") return loadOllamaModels(provider, config);
  return loadOpenAICompatibleModels(provider, config);
}

async function loadGeminiModels(provider: ProviderId, config: ProviderConfig) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(config.apiKey || "")}`,
  );
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return (data.models || [])
    .filter(
      (model: { name?: string; supportedGenerationMethods?: string[] }) =>
        model.name &&
        model.supportedGenerationMethods?.includes("generateContent"),
    )
    .map((model: { name: string; displayName?: string }) => {
      const name = model.name.replace(/^models\//, "");
      return {
        id: `${provider}:${name}`,
        name,
        displayName: model.displayName || name,
      };
    });
}

async function loadOllamaModels(provider: ProviderId, config: ProviderConfig) {
  const baseUrl = (
    config.baseUrl ||
    providerDefaultBaseUrls[provider] ||
    ""
  ).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return (data.models || [])
    .map((model: { name?: string }) => model.name)
    .filter(Boolean)
    .map((name: string) => ({
      id: `${provider}:${name}`,
      name,
      displayName: `${providerLabels[provider]} / ${name}`,
    }));
}

async function loadOpenAICompatibleModels(
  provider: ProviderId,
  config: ProviderConfig,
) {
  const baseUrl = (
    config.baseUrl ||
    providerDefaultBaseUrls[provider] ||
    ""
  ).replace(/\/$/, "");
  if (!baseUrl) throw new Error("Base URL is required");
  const response = await fetch(`${baseUrl}/models`, {
    headers: config.apiKey
      ? { Authorization: `Bearer ${config.apiKey}` }
      : undefined,
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return (data.data || data.models || [])
    .map((model: string | { id?: string; name?: string }) =>
      typeof model === "string" ? model : model.id || model.name,
    )
    .filter(Boolean)
    .map((name: string) => ({
      id: `${provider}:${name}`,
      name,
      displayName: `${providerLabels[provider]} / ${name}`,
    }));
}

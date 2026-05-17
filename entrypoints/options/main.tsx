import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import {
  languageLabels,
  providerDefaultBaseUrls,
  providerLabels,
  type ModelConfig,
  type ProviderConfig,
  type ProviderId,
  type QuickAction,
} from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import "../../src/ui/styles.css";

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

function OptionsApp() {
  const route = useHashRoute();
  const [language] = useStoredState(storage.language);
  const [preferences] = useStoredState(storage.preferences);
  const t = getMessages(language);

  React.useEffect(() => {
    document.documentElement.dataset.accent =
      preferences?.accentColor || "amber";
    document.documentElement.dataset.theme =
      preferences?.colorScheme || "system";
  }, [preferences?.accentColor, preferences?.colorScheme]);

  return (
    <div className="app-shell">
      <aside className="settings-sidebar">
        <div>
          <div className="brand">{t.common.settings}</div>
          <p className="muted">OpenBrowserAgent - {t.app.tagline}</p>
        </div>
        <nav className="stack">
          <a className={`nav-link ${route === "/" ? "active" : ""}`} href="#/">
            {t.options.general}
          </a>
          <a
            className={`nav-link ${route === "/providers" ? "active" : ""}`}
            href="#/providers"
          >
            {t.options.providers}
          </a>
          <a
            className={`nav-link ${route === "/quick-actions" ? "active" : ""}`}
            href="#/quick-actions"
          >
            {t.options.quickActions}
          </a>
          <a
            className="nav-link"
            href="https://github.com/Lumysia/OpenBrowserAgent"
            target="_blank"
            rel="noreferrer"
          >
            {t.common.help}
          </a>
        </nav>
      </aside>
      <main className="settings-main">
        <div className="settings-content">
          {route === "/providers" ? (
            <ProvidersPage />
          ) : route === "/quick-actions" ? (
            <QuickActionsPage />
          ) : (
            <GeneralPage />
          )}
        </div>
      </main>
    </div>
  );
}

function GeneralPage() {
  const [language, setLanguage] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const t = getMessages(language);
  const accentOptions = [
    { id: "green", label: t.options.greenTheme },
    { id: "blue", label: t.options.blueTheme },
    { id: "pink", label: t.options.pinkTheme },
    { id: "purple", label: t.options.purpleTheme },
    { id: "amber", label: t.options.amberTheme },
  ] as const;

  if (!preferences) return null;

  return (
    <div className="stack">
      <div>
        <h1>{t.options.general}</h1>
        <p className="muted">{t.options.languageDescription}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t.common.language}</CardTitle>
          <CardDescription>{t.options.languageDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={language || "en-US"} onValueChange={setLanguage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(languageLabels).map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.options.colorScheme}</CardTitle>
          <CardDescription>{t.options.colorSchemeDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="accent-picker"
            role="radiogroup"
            aria-label={t.options.colorScheme}
          >
            {accentOptions.map((option) => {
              const selected =
                (preferences.accentColor || "amber") === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`accent-dot accent-dot-${option.id}${selected ? " active" : ""}`}
                  aria-label={option.label}
                  aria-checked={selected}
                  role="radio"
                  title={option.label}
                  onClick={() =>
                    setPreferences({ ...preferences, accentColor: option.id })
                  }
                >
                  <span />
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.options.appearance}</CardTitle>
          <CardDescription>{t.options.appearanceDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={preferences.colorScheme || "system"}
            onValueChange={(colorScheme) =>
              setPreferences({
                ...preferences,
                colorScheme: colorScheme as "system" | "light" | "dark",
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{t.options.systemTheme}</SelectItem>
              <SelectItem value="light">{t.options.lightTheme}</SelectItem>
              <SelectItem value="dark">{t.options.darkTheme}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.options.syncSettings}</CardTitle>
          <CardDescription>{t.options.syncSettingsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={preferences.syncSettings === false ? "off" : "on"}
            onValueChange={(value) =>
              setPreferences({ ...preferences, syncSettings: value === "on" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">{t.common.enabled}</SelectItem>
              <SelectItem value="off">{t.common.disabled}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.options.autoScroll}</CardTitle>
          <CardDescription>{t.options.autoScrollDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={preferences.autoScroll === false ? "off" : "on"}
            onValueChange={(value) =>
              setPreferences({ ...preferences, autoScroll: value === "on" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">{t.common.enabled}</SelectItem>
              <SelectItem value="off">{t.common.disabled}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.options.autoRetry}</CardTitle>
          <CardDescription>{t.options.autoRetryDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={preferences.autoRetry === false ? "off" : "on"}
            onValueChange={(value) =>
              setPreferences({ ...preferences, autoRetry: value === "on" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">{t.common.enabled}</SelectItem>
              <SelectItem value="off">{t.common.disabled}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}

function useHashRoute() {
  const [route, setRoute] = useState(
    () => location.hash.replace(/^#/, "") || "/",
  );
  React.useEffect(() => {
    const onHashChange = () => setRoute(location.hash.replace(/^#/, "") || "/");
    addEventListener("hashchange", onHashChange);
    return () => removeEventListener("hashchange", onHashChange);
  }, []);
  return route;
}

function ProvidersPage() {
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
  const manualModelProviders: ProviderId[] = ["openai", "minimax"];
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
        <Badge>{models.length ? t.common.enabled : t.common.disabled}</Badge>
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
        {baseUrlOptions[provider] ? (
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
        ) : provider !== "gemini" ? (
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
        ) : null}
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
              <>
                <Input
                  value={fetchedModelSearch}
                  placeholder={t.options.searchFetchedModels}
                  onChange={(event) =>
                    setFetchedModelSearch(event.target.value)
                  }
                />
                <Select
                  value={selectedFetchedModelId || "none"}
                  onValueChange={(value) =>
                    setSelectedFetchedModelId(value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {selectableFetchedModels.length
                        ? t.options.selectFetchedModel
                        : fetchedModelSearch
                          ? t.options.noFetchedModelsMatch
                          : t.options.allFetchedModelsAdded}
                    </SelectItem>
                    {selectableFetchedModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.displayName || model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={addFetchedModel}
                  disabled={
                    !selectedFetchedModelId ||
                    !selectableFetchedModels.some(
                      (model) => model.id === selectedFetchedModelId,
                    )
                  }
                >
                  {t.options.addSelected}
                </Button>
              </>
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
                      models: models.filter(
                        (candidate) => candidate.id !== model.id,
                      ),
                    })
                  }
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            {!models.length && (
              <p className="muted">{t.options.noModelsAddedYet}</p>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

async function loadProviderModels(
  provider: ProviderId,
  config: ProviderConfig,
): Promise<ModelConfig[]> {
  if (provider === "gemini") {
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

  if (provider === "ollama") {
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

function QuickActionsPage() {
  const [language] = useStoredState(storage.language);
  const [actions, setActions] = useStoredState(storage.quickAction);
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, QuickAction>>({});
  const [savedId, setSavedId] = useState<string>();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string>();
  if (!actions) return null;
  const actionList = actions ?? [];
  const t = getMessages(language);

  function createAction() {
    const next: QuickAction = {
      id: crypto.randomUUID(),
      title: t.options.untitledAction,
      instruction: "",
    };
    setActions([...actionList, next]);
    setDrafts((items) => ({ ...items, [next.id]: next }));
    setSelectedId(next.id);
  }

  function draftFor(action: QuickAction) {
    return drafts[action.id] || action;
  }

  function updateDraft(action: QuickAction, patch: Partial<QuickAction>) {
    setDrafts((items) => ({
      ...items,
      [action.id]: { ...draftFor(action), ...patch },
    }));
  }

  function saveAction(action: QuickAction) {
    const draft = draftFor(action);
    setActions(
      actionList.map((item) => (item.id === action.id ? draft : item)),
    );
    setSavedId(action.id);
    setTimeout(
      () => setSavedId((id) => (id === action.id ? undefined : id)),
      1200,
    );
  }

  function deleteAction(action: QuickAction) {
    if (deleteConfirmId !== action.id) {
      setDeleteConfirmId(action.id);
      return;
    }
    setActions(actionList.filter((item) => item.id !== action.id));
    setDrafts((items) => {
      const next = { ...items };
      delete next[action.id];
      return next;
    });
    setDeleteConfirmId(undefined);
    if (selectedId === action.id) setSelectedId("");
  }

  return (
    <div className="stack">
      <div className="split">
        <div>
          <h1>{t.options.quickActions}</h1>
          <p className="muted">{t.options.quickActionsDescription}</p>
        </div>
        <Button onClick={createAction}>
          <Plus size={16} /> {t.options.newQuickAction}
        </Button>
      </div>
      {!actionList.length && (
        <Card className="empty">
          <CardHeader>
            <CardTitle>{t.options.noQuickActionsTitle}</CardTitle>
            <CardDescription>
              {t.options.noQuickActionsDescription}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      <Accordion
        type="single"
        collapsible
        value={selectedId}
        onValueChange={setSelectedId}
        className="stack"
      >
        {actionList.map((action) => (
          <AccordionItem value={action.id} key={action.id}>
            <AccordionTrigger>
              {action.title || t.options.untitledAction}
            </AccordionTrigger>
            <AccordionContent className="stack">
              <Label>
                {t.options.title}
                <Input
                  style={{ maxWidth: 400 }}
                  value={draftFor(action).title}
                  onChange={(event) =>
                    updateDraft(action, { title: event.target.value })
                  }
                />
              </Label>
              <Label>
                {t.options.instruction}
                <Textarea
                  style={{ maxWidth: 600, minHeight: 150 }}
                  value={draftFor(action).instruction}
                  onChange={(event) =>
                    updateDraft(action, { instruction: event.target.value })
                  }
                />
              </Label>
              <QuickActionVariables />
              <div className="row">
                <Button
                  onClick={() => saveAction(action)}
                  disabled={
                    JSON.stringify(draftFor(action)) === JSON.stringify(action)
                  }
                >
                  {savedId === action.id ? <Check size={16} /> : null}
                  {savedId === action.id ? t.common.saved : t.common.save}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteAction(action)}
                >
                  <Trash2 size={16} />{" "}
                  {deleteConfirmId === action.id
                    ? t.common.confirm
                    : t.options.deleteQuickAction}
                </Button>
                {deleteConfirmId === action.id && (
                  <Button
                    variant="secondary"
                    onClick={() => setDeleteConfirmId(undefined)}
                  >
                    {t.common.cancel}
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function QuickActionVariables() {
  const [language] = useStoredState(storage.language);
  const [copied, setCopied] = useState(false);
  const t = getMessages(language);
  async function copyDateToken() {
    await navigator.clipboard.writeText("{{ date }}").catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div className="stack">
      <span className="muted">{t.options.availableVariables}</span>
      <div className="row">
        <Button variant="outline" size="sm" onClick={copyDateToken}>
          {copied ? <Check size={14} /> : null}
          {"{{ date }}"}
        </Button>
        <span className="muted">
          {t.options.example}: {new Date().toISOString().slice(0, 10)}
        </span>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<OptionsApp />);

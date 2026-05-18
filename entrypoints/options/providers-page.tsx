import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { getMessages } from "../../src/shared/i18n";
import {
  createProviderConfig,
  normalizeProviderState,
  PROVIDER_TYPES,
} from "../../src/shared/provider-instances";
import { storage } from "../../src/shared/storage";
import {
  providerLabels,
  type ModelConfig,
  type ProviderConfig,
  type ProviderId,
} from "../../src/shared/types";
import {
  Accordion,
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
  Switch,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { ModelSelect } from "./provider-controls";
import { ProviderAccordion } from "./provider-accordion";

export function ProvidersPage() {
  const [language] = useStoredState(storage.language);
  const [providerState, setProviderState] = useStoredState(storage.provider);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [providerType, setProviderType] = useState<ProviderId>("openai");
  const [openProviders, setOpenProviders] = useState<string[]>([]);
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

  function updateProvider(providerId: string, next: ProviderConfig) {
    setProviderState((previous) => ({
      ...normalizeProviderState(previous || {}),
      [providerId]: next,
    }));
  }

  function addProvider() {
    const provider = createProviderConfig(providerType, normalizedProviders);
    const providerId = provider.id!;
    setProviderState((previous) => ({
      ...normalizeProviderState(previous || {}),
      [providerId]: provider,
    }));
    setOpenProviders((items) =>
      items.includes(providerId) ? items : [...items, providerId],
    );
  }

  function deleteProvider(providerId: string) {
    const { [providerId]: removed, ...rest } = normalizedProviders;
    setProviderState((previous) => {
      const { [providerId]: _removed, ...next } = normalizeProviderState(
        previous || {},
      );
      return next;
    });
    if (removed?.models?.length)
      setPreferences((previous) =>
        removed.models?.some(
          (model) =>
            model.id === previous.selectedModelId ||
            model.id === previous.selectedImageModelId,
        )
          ? {
              ...previous,
              selectedModelId: undefined,
              selectedImageModelId: undefined,
            }
          : previous,
      );
  }

  return (
    <div className="stack">
      <div className="split">
        <div>
          <h1>{t.options.modelProviders}</h1>
          <p className="muted">{t.options.providerDescription}</p>
        </div>
      </div>
      <div className="provider-top-stack">
        <Card>
          <CardHeader>
            <CardTitle>{t.options.selectModel}</CardTitle>
            <CardDescription>
              {t.options.selectModelDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ModelSelect
              label={t.options.selectModel}
              value={preferences.selectedModelId}
              models={configuredModels}
              emptyLabel={t.options.selectModel}
              onChange={(selectedModelId) =>
                setPreferences((previous) => ({ ...previous, selectedModelId }))
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="setting-switch-row">
              <div>
                <CardTitle>{t.options.enableImageGeneration}</CardTitle>
                <CardDescription>
                  {t.options.enableImageGenerationDescription}
                </CardDescription>
              </div>
              <Switch
                checked={!!preferences.imageGenerationEnabled}
                onCheckedChange={(imageGenerationEnabled) =>
                  setPreferences((previous) => ({
                    ...previous,
                    imageGenerationEnabled,
                  }))
                }
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="provider-image-fields">
              <div className="provider-image-model-field">
                <ModelSelect
                  label={t.options.selectImageModel}
                  value={preferences.selectedImageModelId}
                  models={configuredModels}
                  emptyLabel={t.options.selectImageModel}
                  disabled={!preferences.imageGenerationEnabled}
                  onChange={(selectedImageModelId) =>
                    setPreferences((previous) => ({
                      ...previous,
                      selectedImageModelId,
                    }))
                  }
                />
              </div>
              <Label className="provider-size-field">
                {t.options.imageGenerationSize}
                <Input
                  value={preferences.imageGenerationSize || "1024x1024"}
                  placeholder="1024x1024"
                  disabled={!preferences.imageGenerationEnabled}
                  onChange={(event) =>
                    setPreferences((previous) => ({
                      ...previous,
                      imageGenerationSize: event.target.value,
                    }))
                  }
                />
              </Label>
            </div>
          </CardContent>
        </Card>
        <div className="provider-add-section">
          <div className="provider-section-divider" />
          <div className="provider-add-card">
            <div className="provider-add-copy">
              <span className="provider-add-icon">
                <Plus size={17} />
              </span>
              <div>
                <strong>{t.sidepanel.addProvider}</strong>
                <p className="muted">{t.options.providerDescription}</p>
              </div>
            </div>
            <div className="provider-add-row">
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
          </div>
        </div>
      </div>
      <Accordion
        type="multiple"
        value={openProviders}
        onValueChange={setOpenProviders}
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
              setPreferences((previous) => ({
                ...previous,
                selectedModelId: previous.selectedModelId || model.id,
                selectedImageModelId: previous.selectedImageModelId || model.id,
              }));
            }}
          />
        ))}
      </Accordion>
    </div>
  );
}

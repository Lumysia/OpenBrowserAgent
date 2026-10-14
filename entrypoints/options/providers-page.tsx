import { useMemo, useState } from "react";
import { Bot, Highlighter, Image, Plus, Server } from "lucide-react";
import { getMessages } from "../../src/shared/i18n";
import {
  createProviderConfig,
  normalizeProviderState,
} from "../../src/shared/provider-instances";
import { normalizeSmartBarSettings } from "../../src/shared/smart-bar";
import { storage } from "../../src/shared/storage";
import { type ModelConfig, type ProviderConfig } from "../../src/shared/types";
import {
  ADD_PROVIDER_TYPES,
  type ProviderId,
} from "../../src/shared/providers";
import {
  Accordion,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingSwitch,
  SettingsPageHeader,
  SettingsSection,
} from "../../src/ui/components";
import { providerTypeLabel } from "../../src/ui/provider-display";
import { useStoredState } from "../../src/ui/useStoredState";
import { ModelSelect, useConfiguredModels } from "./model-select";
import { ProviderAccordion } from "./provider-accordion";
import { DEFAULT_PREFERENCES } from "../../src/shared/default-preferences";
import { useUiLanguage } from "../../src/ui/messages";

export function ProvidersPage() {
  const language = useUiLanguage();
  const [providerState, setProviderState] = useStoredState(storage.provider);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [providerType, setProviderType] = useState<ProviderId>("openai");
  const [openProviders, setOpenProviders] = useState<string[]>([]);
  const normalizedProviders = useMemo(
    () => normalizeProviderState(providerState || {}),
    [providerState],
  );
  const providerEntries = Object.entries(normalizedProviders);
  const configuredModels = useConfiguredModels();
  const t = getMessages(language);

  if (!providerState || !preferences) return null;

  function updateProvider(providerId: string, next: ProviderConfig) {
    setProviderState((previous) => ({ ...previous, [providerId]: next }));
  }

  function addProvider() {
    const provider = createProviderConfig(providerType, normalizedProviders);
    const providerId = provider.id!;
    setProviderState((previous) => ({ [providerId]: provider, ...previous }));
    setOpenProviders((items) =>
      items.includes(providerId) ? items : [providerId, ...items],
    );
  }

  function deleteProvider(providerId: string) {
    const removed = normalizedProviders[providerId];
    setProviderState((previous) => {
      const { [providerId]: _removed, ...next } = previous;
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

  function handleModelAdded(model: ModelConfig) {
    setPreferences((previous) => ({
      ...previous,
      selectedModelId: previous.selectedModelId || model.id,
      selectedImageModelId: previous.selectedImageModelId || model.id,
    }));
  }

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<Server />}
        title={t.options.modelProviders}
        description={t.options.providerDescription}
      />
      <div className="provider-top-stack">
        <SettingsSection
          icon={<Plus />}
          title={t.sidepanel.addProvider}
          description={t.options.providerDescription}
          contentClassName="stack"
        >
          <div className="provider-add-row">
            <Select
              value={providerType}
              onValueChange={(value) => setProviderType(value as ProviderId)}
            >
              <SelectTrigger aria-label={t.options.providers}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADD_PROVIDER_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {providerTypeLabel(type, t)}
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
                onModelAdded={handleModelAdded}
              />
            ))}
          </Accordion>
        </SettingsSection>
        <SettingsSection
          icon={<Bot />}
          title={t.options.selectModel}
          description={t.options.selectModelDescription}
        >
          <ModelSelect
            t={t}
            label={t.options.selectModel}
            value={preferences.selectedModelId}
            models={configuredModels}
            noneLabel={t.options.selectModel}
            onChange={(selectedModelId) =>
              setPreferences((previous) => ({ ...previous, selectedModelId }))
            }
          />
        </SettingsSection>
        <SettingsSection
          icon={<Bot />}
          title={t.options.helperModel}
          description={t.options.helperModelDescription}
        >
          <ModelSelect
            t={t}
            models={configuredModels}
            value={preferences.helperModelId}
            label={t.options.helperModel}
            noneLabel={t.options.modelSameAsChat}
            onChange={(helperModelId) =>
              setPreferences((previous) => ({ ...previous, helperModelId }))
            }
          />
        </SettingsSection>
        <SettingsSection
          icon={<Highlighter />}
          title={t.smartBar.model}
          description={t.smartBar.modelDescription}
        >
          <ModelSelect
            t={t}
            models={configuredModels}
            value={normalizeSmartBarSettings(preferences.smartBar).modelId}
            label={t.smartBar.model}
            noneLabel={t.options.modelSameAsChat}
            onChange={(modelId = "") =>
              setPreferences((previous) => ({
                ...previous,
                smartBar: {
                  ...normalizeSmartBarSettings(previous.smartBar),
                  modelId,
                },
              }))
            }
          />
        </SettingsSection>
        <Card>
          <CardHeader>
            <SettingSwitch
              icon={<Image size={18} />}
              title={t.options.enableImageGeneration}
              description={t.options.enableImageGenerationDescription}
              checked={!!preferences.imageGenerationEnabled}
              onChange={(imageGenerationEnabled) =>
                setPreferences((previous) => ({
                  ...previous,
                  imageGenerationEnabled,
                }))
              }
            />
          </CardHeader>
          <CardContent>
            <div className="provider-image-fields">
              <div className="provider-image-model-field">
                <Label>
                  {t.options.selectImageModel}
                  <ModelSelect
                    t={t}
                    label={t.options.selectImageModel}
                    value={preferences.selectedImageModelId}
                    models={configuredModels}
                    noneLabel={t.options.selectImageModel}
                    disabled={!preferences.imageGenerationEnabled}
                    onChange={(selectedImageModelId) =>
                      setPreferences((previous) => ({
                        ...previous,
                        selectedImageModelId,
                      }))
                    }
                  />
                </Label>
              </div>
              <Label className="provider-size-field">
                {t.options.imageGenerationSize}
                <Input
                  value={
                    preferences.imageGenerationSize ||
                    DEFAULT_PREFERENCES.imageGenerationSize
                  }
                  placeholder={DEFAULT_PREFERENCES.imageGenerationSize}
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
      </div>
    </div>
  );
}

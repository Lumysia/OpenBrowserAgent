import { Bot, Highlighter, Image, Plus, Server } from "lucide-react";
import { getMessages } from "../../src/shared/i18n";
import { normalizeSmartBarSettings } from "../../src/shared/smart-bar";
import { storage } from "../../src/shared/storage";
import {
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  SettingSwitch,
  SettingsPageHeader,
  SettingsSection,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { ModelSelect, useConfiguredModels } from "./model-select";
import { ProviderList } from "./provider-list";
import { DEFAULT_PREFERENCES } from "../../src/shared/default-preferences";
import { useUiLanguage } from "../../src/ui/messages";

export function ProvidersPage() {
  const language = useUiLanguage();
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const configuredModels = useConfiguredModels();
  const t = getMessages(language);

  if (!preferences) return null;

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<Server />}
        title={t.options.modelProviders}
        description={t.options.providerDescription}
      />
      <div className="provider-top-stack">
        <SettingsSection icon={<Plus />} title={t.sidepanel.addProvider}>
          <ProviderList />
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

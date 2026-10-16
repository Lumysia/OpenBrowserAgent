import { Cpu, Image, Plus, Server } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import { MODEL_ROLES, type ModelRole } from "../../src/shared/model-roles";
import { storage } from "../../src/shared/storage";
import {
  Card,
  CardHeader,
  SettingSwitch,
  SettingToggleRow,
  SettingsPageHeader,
  SettingsSection,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { useStoredState } from "../../src/ui/useStoredState";
import { ModelSelect, useConfiguredModels } from "./model-select";
import { ProviderList } from "./provider-list";

// Each feature's row in the Models table: its name, what it does, and what
// "no choice" means.
const ROLE_TEXT: Record<
  ModelRole["id"],
  (t: Messages) => { title: string; description: string; none: string }
> = {
  chat: (t) => ({
    title: t.settings.modelChat,
    description: t.options.selectModelDescription,
    none: t.options.selectModel,
  }),
  helper: (t) => ({
    title: t.settings.modelHelper,
    description: t.options.helperModelDescription,
    none: t.options.modelSameAsChat,
  }),
  smartBar: (t) => ({
    title: t.settings.modelSmartBar,
    description: t.smartBar.modelDescription,
    none: t.options.modelSameAsChat,
  }),
  translation: (t) => ({
    title: t.settings.modelTranslation,
    description: t.pageTranslate.modelDescription,
    none: t.options.modelSameAsChat,
  }),
  images: (t) => ({
    title: t.settings.modelImages,
    description: t.options.enableImageGenerationDescription,
    none: t.options.modelSameAsChat,
  }),
};

export function ProvidersPage() {
  const t = useMessages();
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const models = useConfiguredModels();

  if (!preferences) return null;

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<Server />}
        title={t.settings.providersModels}
        description={t.options.providerDescription}
      />
      <SettingsSection icon={<Plus />} title={t.sidepanel.addProvider}>
        <ProviderList />
      </SettingsSection>
      <SettingsSection
        icon={<Cpu />}
        title={t.settings.models}
        description={t.settings.modelsDescription}
      >
        <div className="settings-toggle-list models-table">
          {MODEL_ROLES.map((role) => {
            const text = ROLE_TEXT[role.id](t);
            return (
              <SettingToggleRow
                key={role.id}
                title={text.title}
                description={text.description}
                aside={
                  <ModelSelect
                    t={t}
                    models={models}
                    value={role.get(preferences)}
                    label={text.title}
                    noneLabel={text.none}
                    onChange={(modelId) =>
                      setPreferences((previous) => role.set(previous, modelId))
                    }
                  />
                }
              />
            );
          })}
        </div>
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
      </Card>
    </div>
  );
}

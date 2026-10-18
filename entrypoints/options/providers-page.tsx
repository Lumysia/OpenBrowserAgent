import { Cpu, Plus, Server } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import { MODEL_ROLES, type ModelRole } from "../../src/shared/model-roles";
import {
  normalizePageTranslateSettings,
  pageTranslateUsesModel,
} from "../../src/shared/page-translate/settings";
import { storage } from "../../src/shared/storage";
import { formatMessage } from "../../src/shared/text";
import type { Preferences } from "../../src/shared/types";
import {
  SettingToggleRow,
  SettingsPageHeader,
  SettingsSection,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { useStoredState } from "../../src/ui/useStoredState";
import { ModelSelect, useRoleModels } from "./model-select";
import { ProviderList } from "./provider-list";

// Each feature's row in the Models table: its name, what it does, what
// "no choice" means and, while the feature doesn't use a model, why.
const ROLE_TEXT: Record<
  ModelRole["id"],
  (
    t: Messages,
    preferences: Preferences,
  ) => {
    title: string;
    description: string;
    none: string;
    unavailableReason?: string;
  }
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
  translation: (t, preferences) => {
    const { engine } = normalizePageTranslateSettings(
      preferences.pageTranslate,
    );
    return {
      title: t.settings.modelTranslation,
      description: t.pageTranslate.modelDescription,
      none: t.options.modelSameAsChat,
      unavailableReason: pageTranslateUsesModel(engine)
        ? undefined
        : formatMessage(t.settings.modelTranslationUnavailable, {
            engine: t.pageTranslate.engineNames[engine],
          }),
    };
  },
  images: (t) => ({
    title: t.settings.modelImages,
    description: t.options.imageModelDescription,
    none: t.options.imageModelOff,
  }),
};

export function ProvidersPage() {
  const t = useMessages();
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const modelsOf = useRoleModels();

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
            const text = ROLE_TEXT[role.id](t, preferences);
            return (
              <SettingToggleRow
                key={role.id}
                title={text.title}
                description={text.description}
                aside={
                  <ModelSelect
                    t={t}
                    models={modelsOf(role)}
                    value={role.get(preferences)}
                    label={text.title}
                    noneLabel={text.none}
                    unavailableReason={text.unavailableReason}
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
    </div>
  );
}

import { Globe, Highlighter, Keyboard, ListChecks } from "lucide-react";
import {
  normalizeSmartBarSettings,
  SMART_BAR_EDIT_ACTIONS,
  SMART_BAR_PAGE_ACTIONS,
  SMART_BAR_SITE_MODE,
  SMART_BAR_TRIGGER,
  type SmartBarAction,
  type SmartBarSettings,
  type SmartBarSiteMode,
  type SmartBarTrigger,
} from "../../src/shared/smart-bar";
import { storage } from "../../src/shared/storage";
import {
  SettingSwitchCard,
  SettingToggleRow,
  ToggleGroup,
  ToggleGroupItem,
  SettingsPageHeader,
  SettingsSection,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { SMART_BAR_COMMAND } from "../../src/shared/smart-bar-protocol";
import { CommandShortcut } from "./command-shortcut";
import { HostListEditor } from "./host-list-editor";
import { useMessages } from "../../src/ui/messages";

export function SmartBarPage() {
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const t = useMessages();
  const s = t.smartBar;
  if (!preferences) return null;
  const settings = normalizeSmartBarSettings(preferences.smartBar);
  const update = (change: Partial<SmartBarSettings>) =>
    setPreferences((previous) => ({
      ...previous,
      smartBar: { ...normalizeSmartBarSettings(previous.smartBar), ...change },
    }));
  const hostLabels = {
    placeholder: s.sitePlaceholder,
    add: s.addSite,
    remove: s.removeSite,
    invalid: s.invalidSite,
    empty: s.noSites,
  };
  const actionToggles = (
    actions: readonly SmartBarAction[],
    disabled: SmartBarAction[],
    key: "disabledPageActions" | "disabledEditActions",
  ) => (
    <div className="settings-toggle-list">
      {actions.map((action) => (
        <SettingToggleRow
          key={action}
          title={s.actions[action]}
          value={!disabled.includes(action)}
          onChange={(on) =>
            update({
              [key]: on
                ? disabled.filter((item) => item !== action)
                : [...disabled, action],
            })
          }
        />
      ))}
    </div>
  );

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<Highlighter />}
        title={s.settingsTitle}
        description={s.settingsDescription}
      />
      <SettingSwitchCard
        icon={<Highlighter size={18} />}
        title={s.enable}
        description={s.enableDescription}
        checked={settings.enabled}
        onChange={(enabled) => update({ enabled })}
      />
      <SettingsSection
        icon={<Keyboard />}
        title={s.trigger}
        description={s.triggerDescription}
        contentClassName="stack"
      >
        <ToggleGroup
          type="single"
          aria-label={s.trigger}
          value={settings.trigger}
          onValueChange={(trigger) =>
            trigger && update({ trigger: trigger as SmartBarTrigger })
          }
        >
          <ToggleGroupItem value={SMART_BAR_TRIGGER.selection}>
            {s.triggerSelection}
          </ToggleGroupItem>
          <ToggleGroupItem value={SMART_BAR_TRIGGER.shortcut}>
            {s.triggerShortcut}
          </ToggleGroupItem>
        </ToggleGroup>
        {settings.trigger === SMART_BAR_TRIGGER.shortcut && (
          <CommandShortcut command={SMART_BAR_COMMAND} />
        )}
      </SettingsSection>
      <SettingsSection
        icon={<Globe />}
        title={s.sites}
        description={s.sitesDescription}
        contentClassName="stack"
      >
        <ToggleGroup
          type="single"
          aria-label={s.sites}
          value={settings.siteMode}
          onValueChange={(siteMode) =>
            siteMode && update({ siteMode: siteMode as SmartBarSiteMode })
          }
        >
          <ToggleGroupItem value={SMART_BAR_SITE_MODE.blockList}>
            {s.siteModeBlockList}
          </ToggleGroupItem>
          <ToggleGroupItem value={SMART_BAR_SITE_MODE.allowList}>
            {s.siteModeAllowList}
          </ToggleGroupItem>
        </ToggleGroup>
        <HostListEditor
          label={s.blockedSites}
          hosts={settings.blockedHosts}
          labels={hostLabels}
          onChange={(blockedHosts) => update({ blockedHosts })}
        />
        <HostListEditor
          label={s.allowedSites}
          hosts={settings.allowedHosts}
          labels={hostLabels}
          onChange={(allowedHosts) => update({ allowedHosts })}
        />
      </SettingsSection>
      <SettingsSection
        icon={<ListChecks />}
        title={s.pageActions}
        description={s.pageActionsDescription}
      >
        {actionToggles(
          SMART_BAR_PAGE_ACTIONS,
          settings.disabledPageActions,
          "disabledPageActions",
        )}
      </SettingsSection>
      <SettingsSection
        icon={<ListChecks />}
        title={s.editActions}
        description={s.editActionsDescription}
      >
        {actionToggles(
          SMART_BAR_EDIT_ACTIONS,
          settings.disabledEditActions,
          "disabledEditActions",
        )}
      </SettingsSection>
    </div>
  );
}

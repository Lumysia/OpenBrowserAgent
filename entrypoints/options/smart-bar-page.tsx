import { Globe, Highlighter, Keyboard, ListChecks } from "lucide-react";
import { getMessages } from "../../src/shared/i18n";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SettingSwitchCard,
  SettingToggleRow,
  ToggleGroup,
  ToggleGroupItem,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { HostListEditor } from "./host-list-editor";

export function SmartBarPage() {
  const [language] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const t = getMessages(language);
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
      <div>
        <h1 className="settings-page-title">
          <Highlighter size={24} /> {s.settingsTitle}
        </h1>
        <p className="muted">{s.settingsDescription}</p>
      </div>
      <SettingSwitchCard
        icon={<Highlighter size={18} />}
        title={s.enable}
        description={s.enableDescription}
        checked={settings.enabled}
        onChange={(enabled) => update({ enabled })}
      />
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <Keyboard size={18} /> {s.trigger}
          </CardTitle>
          <CardDescription>{s.triggerDescription}</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <Globe size={18} /> {s.sites}
          </CardTitle>
          <CardDescription>{s.sitesDescription}</CardDescription>
        </CardHeader>
        <CardContent className="stack">
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
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <ListChecks size={18} /> {s.pageActions}
          </CardTitle>
          <CardDescription>{s.pageActionsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {actionToggles(
            SMART_BAR_PAGE_ACTIONS,
            settings.disabledPageActions,
            "disabledPageActions",
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <ListChecks size={18} /> {s.editActions}
          </CardTitle>
          <CardDescription>{s.editActionsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {actionToggles(
            SMART_BAR_EDIT_ACTIONS,
            settings.disabledEditActions,
            "disabledEditActions",
          )}
        </CardContent>
      </Card>
    </div>
  );
}

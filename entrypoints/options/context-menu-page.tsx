import { ListChecks, MousePointerClick } from "lucide-react";
import {
  CONTEXT_MENU_ITEMS,
  normalizeContextMenuSettings,
  type ContextMenuSettings,
} from "../../src/shared/context-menu";
import { storage } from "../../src/shared/storage";
import {
  SettingSwitchCard,
  SettingToggleRow,
  SettingsPageHeader,
  SettingsSection,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { useMessages } from "../../src/ui/messages";

export function ContextMenuPage() {
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const t = useMessages();
  const s = t.contextMenu;
  const p = t.pageTranslate;
  const itemLabels = {
    ...s.itemLabels,
    translatePage: p.menuItemLabel,
    translateSubtitles: p.subtitles.menuItemLabel,
  };
  if (!preferences) return null;
  const settings = normalizeContextMenuSettings(preferences.contextMenu);
  const update = (change: Partial<ContextMenuSettings>) =>
    setPreferences((previous) => ({
      ...previous,
      contextMenu: {
        ...normalizeContextMenuSettings(previous.contextMenu),
        ...change,
      },
    }));

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<MousePointerClick />}
        title={s.settingsTitle}
        description={s.settingsDescription}
      />
      <SettingSwitchCard
        icon={<MousePointerClick size={18} />}
        title={s.enable}
        description={s.enableDescription}
        checked={settings.enabled}
        onChange={(enabled) => update({ enabled })}
      />
      <SettingsSection
        icon={<ListChecks />}
        title={s.itemsTitle}
        description={s.itemsDescription}
      >
        <div className="settings-toggle-list">
          {CONTEXT_MENU_ITEMS.map((item) => (
            <SettingToggleRow
              key={item}
              title={itemLabels[item]}
              value={!settings.disabledItems.includes(item)}
              disabled={!settings.enabled}
              onChange={(on) =>
                update({
                  disabledItems: on
                    ? settings.disabledItems.filter((other) => other !== item)
                    : [...settings.disabledItems, item],
                })
              }
            />
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

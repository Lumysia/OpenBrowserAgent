import { ListChecks, MousePointerClick } from "lucide-react";
import {
  CONTEXT_MENU_ITEM,
  CONTEXT_MENU_ITEMS,
  normalizeContextMenuSettings,
  type ContextMenuItem,
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

// Items shown with the feature they belong to (On pages → Translate); the
// Right-click menu tab lists the others.
export const TRANSLATE_MENU_ITEMS: ContextMenuItem[] = [
  CONTEXT_MENU_ITEM.translatePage,
  CONTEXT_MENU_ITEM.translateSubtitles,
];
const OTHER_MENU_ITEMS = CONTEXT_MENU_ITEMS.filter(
  (item) => !TRANSLATE_MENU_ITEMS.includes(item),
);

function useContextMenuSettings() {
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const settings =
    preferences && normalizeContextMenuSettings(preferences.contextMenu);
  const update = (change: Partial<ContextMenuSettings>) =>
    setPreferences((previous) => ({
      ...previous,
      contextMenu: {
        ...normalizeContextMenuSettings(previous.contextMenu),
        ...change,
      },
    }));
  return { settings, update };
}

export function ContextMenuPage() {
  const t = useMessages();
  const s = t.contextMenu;
  const { settings, update } = useContextMenuSettings();
  if (!settings) return null;

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
      <ContextMenuItemsSection
        items={OTHER_MENU_ITEMS}
        title={s.itemsTitle}
        description={s.itemsDescription}
      />
    </div>
  );
}

// Switches for some of the right-click menu's items.
export function ContextMenuItemsSection({
  items,
  title,
  description,
}: {
  items: ContextMenuItem[];
  title: string;
  description: string;
}) {
  const t = useMessages();
  const { settings, update } = useContextMenuSettings();
  if (!settings) return null;
  const itemLabels = {
    ...t.contextMenu.itemLabels,
    translatePage: t.pageTranslate.menuItemLabel,
    translateSubtitles: t.pageTranslate.subtitles.menuItemLabel,
  };
  return (
    <SettingsSection
      icon={<ListChecks />}
      title={title}
      description={description}
    >
      <div className="settings-toggle-list">
        {items.map((item) => (
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
  );
}

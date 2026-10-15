import { ListChecks, MousePointerClick } from "lucide-react";
import {
  CONTEXT_MENU_ITEMS,
  normalizeContextMenuSettings,
  type ContextMenuSettings,
} from "../../src/shared/context-menu";
import { getMessages } from "../../src/shared/i18n";
import { getPageTranslateMessages } from "../../src/shared/page-translate/messages";
import { storage } from "../../src/shared/storage";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SettingSwitchCard,
  SettingToggleRow,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function ContextMenuPage() {
  const [language] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const s = getMessages(language).contextMenu;
  const p = getPageTranslateMessages(language);
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
      <div>
        <h1 className="settings-page-title">
          <MousePointerClick size={24} /> {s.settingsTitle}
        </h1>
        <p className="muted">{s.settingsDescription}</p>
      </div>
      <SettingSwitchCard
        icon={<MousePointerClick size={18} />}
        title={s.enable}
        description={s.enableDescription}
        checked={settings.enabled}
        onChange={(enabled) => update({ enabled })}
      />
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <ListChecks size={18} /> {s.itemsTitle}
          </CardTitle>
          <CardDescription>{s.itemsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}

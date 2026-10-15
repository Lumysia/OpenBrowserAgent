import { Keyboard, MousePointerClick } from "lucide-react";
import { PAGE_TRANSLATE_COMMAND } from "../../src/shared/page-translate/protocol";
import type { PageTranslateSettings } from "../../src/shared/page-translate/settings";
import { CardDescription, SettingSwitchCard } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { CommandShortcut } from "./command-shortcut";
import { HostListEditor } from "./host-list-editor";

// The ways into page translation besides the menu: the button on pages
// (with the sites it is hidden on) and the keyboard shortcut.
export function PageTranslateAccess({
  settings,
  update,
}: {
  settings: PageTranslateSettings;
  update: (change: Partial<PageTranslateSettings>) => void;
}) {
  const t = useMessages();
  const p = t.pageTranslate;
  return (
    <>
      <SettingSwitchCard
        icon={<MousePointerClick size={18} />}
        title={p.button.setting}
        description={p.button.settingDescription}
        checked={settings.pageButton}
        onChange={(pageButton) => update({ pageButton })}
      >
        {(settings.pageButton || !!settings.pageButtonHiddenHosts.length) && (
          <>
            <HostListEditor
              label={p.button.hiddenSites}
              hosts={settings.pageButtonHiddenHosts}
              labels={{
                placeholder: t.smartBar.sitePlaceholder,
                add: t.smartBar.addSite,
                remove: t.smartBar.removeSite,
                invalid: t.smartBar.invalidSite,
                empty: t.smartBar.noSites,
              }}
              onChange={(pageButtonHiddenHosts) =>
                update({ pageButtonHiddenHosts })
              }
            />
            <CardDescription>{p.button.hiddenSitesDescription}</CardDescription>
          </>
        )}
      </SettingSwitchCard>
      <SettingSwitchCard
        icon={<Keyboard size={18} />}
        title={p.shortcut.setting}
        description={p.shortcut.settingDescription}
        checked={settings.shortcut}
        onChange={(shortcut) => update({ shortcut })}
      >
        <CommandShortcut command={PAGE_TRANSLATE_COMMAND} />
      </SettingSwitchCard>
    </>
  );
}

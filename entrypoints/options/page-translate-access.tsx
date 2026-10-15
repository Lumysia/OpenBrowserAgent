import { MousePointerClick } from "lucide-react";
import type { PageTranslateSettings } from "../../src/shared/page-translate/settings";
import { CardDescription, SettingSwitchCard } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { HostListEditor } from "./host-list-editor";

// The button on pages, with the sites it is hidden on. (The keyboard
// shortcut is under General → Keyboard shortcuts.)
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
    </>
  );
}

import { useEffect, useState } from "react";
import { ExternalLink, Keyboard, MousePointerClick } from "lucide-react";
import { getBrowserApi } from "../../src/shared/browser-api";
import { BROWSER_SHORTCUTS_URL } from "../../src/shared/config";
import { PAGE_TRANSLATE_COMMAND } from "../../src/shared/page-translate/protocol";
import type { PageTranslateSettings } from "../../src/shared/page-translate/settings";
import { openOrFocusUrl } from "../../src/shared/tab-navigation";
import {
  Button,
  CardDescription,
  SettingSwitchCard,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { HostListEditor } from "./host-list-editor";

// Firefox (moz-extension pages) has no page to open for its shortcut
// settings.
const SHORTCUTS_PAGE = getBrowserApi()
  .runtime.getURL("")
  .startsWith("moz-extension:")
  ? undefined
  : BROWSER_SHORTCUTS_URL;

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
  const shortcut = useCommandShortcut(PAGE_TRANSLATE_COMMAND);
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
        {shortcut !== undefined && (
          <div className="split">
            <CardDescription>
              {shortcut
                ? p.shortcut.current.replace("{shortcut}", shortcut)
                : p.shortcut.none}
            </CardDescription>
            {SHORTCUTS_PAGE && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void openOrFocusUrl(SHORTCUTS_PAGE)}
              >
                <ExternalLink size={14} />
                {p.shortcut.change}
              </Button>
            )}
          </div>
        )}
        {shortcut !== undefined && !SHORTCUTS_PAGE && (
          <CardDescription>{p.shortcut.firefoxHint}</CardDescription>
        )}
      </SettingSwitchCard>
    </>
  );
}

// The keys of one of the extension's commands, as the browser shows them:
// "" when none is set, undefined where the browser has no commands. Read
// again when the user comes back from changing it.
function useCommandShortcut(name: string) {
  const [shortcut, setShortcut] = useState<string>();
  useEffect(() => {
    const commands = getBrowserApi().commands;
    if (!commands?.getAll) return;
    let active = true;
    const read = () =>
      void commands.getAll().then((all) => {
        const command = all.find((item) => item.name === name);
        if (active) setShortcut(command && (command.shortcut ?? ""));
      });
    read();
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    addEventListener("focus", read);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [name]);
  return shortcut;
}

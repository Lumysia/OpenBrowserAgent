import { ExternalLink, Keyboard } from "lucide-react";
import { getBrowserApi } from "../../src/shared/browser-api";
import { BROWSER_SHORTCUTS_URL } from "../../src/shared/config";
import { normalizePageTranslateSettings } from "../../src/shared/page-translate/settings";
import { PAGE_TRANSLATE_COMMAND } from "../../src/shared/page-translate/protocol";
import { storage } from "../../src/shared/storage";
import { openOrFocusUrl } from "../../src/shared/tab-navigation";
import type { Preferences } from "../../src/shared/types";
import {
  Badge,
  Button,
  CardDescription,
  SettingToggleRow,
  SettingsSection,
} from "../../src/ui/components";
import { useCommands } from "../../src/ui/use-commands";
import { useMessages } from "../../src/ui/messages";
import { useStoredState } from "../../src/ui/useStoredState";

// The toolbar button's command (Manifest V3 and V2).
const ACTION_COMMANDS = ["_execute_action", "_execute_browser_action"];

// Firefox (moz-extension pages) has no page to open for its shortcut
// settings.
const SHORTCUTS_PAGE = getBrowserApi()
  .runtime.getURL("")
  .startsWith("moz-extension:")
  ? undefined
  : BROWSER_SHORTCUTS_URL;

// Commands that also have an on/off preference, kept with their shortcut.
const COMMAND_SWITCHES: Record<
  string,
  {
    get: (preferences: Preferences) => boolean;
    set: (preferences: Preferences, on: boolean) => Preferences;
  }
> = {
  [PAGE_TRANSLATE_COMMAND]: {
    get: (preferences) =>
      normalizePageTranslateSettings(preferences.pageTranslate).shortcut,
    set: (preferences, shortcut) => ({
      ...preferences,
      pageTranslate: {
        ...normalizePageTranslateSettings(preferences.pageTranslate),
        shortcut,
      },
    }),
  },
};

// Every command with its keys, and one way to change them: the browser's
// shortcut settings.
export function ShortcutsSection() {
  const t = useMessages();
  const commands = useCommands();
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  if (!commands?.length || !preferences) return null;
  return (
    <SettingsSection
      icon={<Keyboard />}
      title={t.settings.shortcuts}
      description={t.settings.shortcutsDescription}
      contentClassName="stack"
    >
      <div className="settings-toggle-list">
        {commands.map((command) => {
          const toggle = COMMAND_SWITCHES[command.name];
          const keys = (
            <Badge>{command.shortcut || t.settings.shortcutNone}</Badge>
          );
          return (
            <SettingToggleRow
              key={command.name}
              title={
                ACTION_COMMANDS.includes(command.name)
                  ? t.settings.openSidePanelCommand
                  : command.description || command.name
              }
              aside={toggle ? undefined : keys}
              value={toggle?.get(preferences)}
              onChange={
                toggle &&
                ((on) => setPreferences((previous) => toggle.set(previous, on)))
              }
            >
              {toggle && keys}
            </SettingToggleRow>
          );
        })}
      </div>
      {SHORTCUTS_PAGE ? (
        <div className="row">
          <Button
            variant="outline"
            onClick={() => void openOrFocusUrl(SHORTCUTS_PAGE)}
          >
            <ExternalLink size={14} />
            {t.settings.changeShortcuts}
          </Button>
        </div>
      ) : (
        <CardDescription>{t.settings.shortcutsFirefoxHint}</CardDescription>
      )}
    </SettingsSection>
  );
}

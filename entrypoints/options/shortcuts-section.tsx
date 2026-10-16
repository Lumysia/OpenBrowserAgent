import { ExternalLink, Keyboard } from "lucide-react";
import { getBrowserApi } from "../../src/shared/browser-api";
import {
  commandTitle,
  SIDE_PANEL_COMMAND,
  suggestedSidePanelKeys,
} from "../../src/shared/commands";
import { BROWSER_SHORTCUTS_URL } from "../../src/shared/config";
import { openOrFocusUrl } from "../../src/shared/tab-navigation";
import {
  Badge,
  Button,
  CardDescription,
  SettingToggleRow,
  SettingsSection,
} from "../../src/ui/components";
import { useCommands } from "../../src/ui/use-commands";
import { useMessages } from "../../src/ui/messages";

// Firefox (moz-extension pages) has no page to open for its shortcut
// settings.
const SHORTCUTS_PAGE = getBrowserApi()
  .runtime.getURL("")
  .startsWith("moz-extension:")
  ? undefined
  : BROWSER_SHORTCUTS_URL;

// Every command with its keys, and one way to change them: the browser's
// shortcut settings.
export function ShortcutsSection() {
  const t = useMessages();
  const commands = useCommands();
  if (!commands?.length) return null;
  return (
    <SettingsSection
      icon={<Keyboard />}
      title={t.settings.shortcuts}
      description={t.settings.shortcutsDescription}
      contentClassName="stack"
    >
      <div className="settings-toggle-list">
        {commands.map((command) => (
          <SettingToggleRow
            key={command.name}
            title={commandTitle(command, t)}
            // The side panel without keys: Chrome sets the suggested ones
            // only on a fresh install, and not when they are taken.
            description={
              command.name === SIDE_PANEL_COMMAND && !command.shortcut
                ? t.settings.sidePanelShortcutHint.replace(
                    "{keys}",
                    suggestedSidePanelKeys(navigator.platform),
                  )
                : undefined
            }
            aside={<Badge>{command.shortcut || t.settings.shortcutNone}</Badge>}
          />
        ))}
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

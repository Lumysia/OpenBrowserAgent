import { PanelRight } from "lucide-react";
import { getBrowserApi } from "../../src/shared/browser-api";
import { SIDE_PANEL_COMMAND } from "../../src/shared/commands";
import { openSidePanelIn } from "../../src/shared/side-panel";
import { Button } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { useCommands } from "../../src/ui/use-commands";
import { useCurrentWindowId } from "../../src/ui/use-current-window-id";

// The menu's main action, with the side panel's own shortcut. The browser
// opens the panel only during the click, so the window is looked up before
// it; the menu closes once the panel is open.
export function OpenSidePanelButton() {
  const t = useMessages();
  const windowId = useCurrentWindowId();
  const shortcut = useCommands()?.find(
    (command) => command.name === SIDE_PANEL_COMMAND,
  )?.shortcut;
  // Chromium's panel needs the window.
  const ready = windowId !== undefined || !getBrowserApi().sidePanel?.open;
  return (
    <Button
      className="toolbar-menu-open-panel"
      disabled={!ready}
      onClick={() =>
        openSidePanelIn(windowId).then(
          () => window.close(),
          (error: unknown) =>
            console.warn("Failed to open the side panel", error),
        )
      }
    >
      <PanelRight size={18} aria-hidden />
      <span className="toolbar-menu-open-panel-label">{t.setup.openPanel}</span>
      {shortcut && <kbd className="toolbar-menu-shortcut">{shortcut}</kbd>}
    </Button>
  );
}

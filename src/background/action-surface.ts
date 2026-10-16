import { getBrowserApi } from "../shared/browser-api";
import { SIDE_PANEL_COMMAND } from "../shared/commands";
import { openSetup } from "../shared/setup-progress";
import { openSidePanelIn } from "../shared/side-panel";
import { knownSetupFinished, setupFinished } from "./setup-gate";

type ActionWithPopup = {
  openPopup?: (options?: { windowId?: number }) => Promise<void>;
};

// Every way into the side panel goes through here: until setup is finished
// (setup-gate.ts) they open the guided setup instead.

// A toolbar button click (or its shortcut) that came to the extension. Once
// setup is finished the button opens the toolbar menu by itself (its popup,
// set in setup-gate.ts), so a click comes here before that, or in a worker
// that just started and hasn't set the popup yet.
export async function openActionSurface(tab?: chrome.tabs.Tab) {
  // Known finished, yet no popup: the panel, in the click's gesture.
  if (knownSetupFinished())
    return openSidePanelIn(tab?.windowId, { toggle: true });
  if (!(await setupFinished())) return openSetup();
  // The popup is set now; Chromium opens it without the gesture.
  const api = getBrowserApi();
  const action = (api.action ?? api.browserAction) as
    ActionWithPopup | undefined;
  if (action?.openPopup) return action.openPopup({ windowId: tab?.windowId });
  return openSidePanelIn(tab?.windowId, { toggle: true });
}

// Opens the side panel for page UI, or setup while it is known to be
// unfinished; returns whether it is the panel. Call it before any await in a
// message listener: Chromium and Firefox only open the panel during the
// user's gesture. A worker that doesn't know yet opens the panel, which
// sends itself to setup if it must (sidepanel's setup gate).
export function openSidePanel(windowId: number | undefined) {
  if (knownSetupFinished() === false) {
    openSetup().catch(console.warn);
    return false;
  }
  openSidePanelIn(windowId).catch((error: unknown) =>
    console.warn("Failed to open the side panel", error),
  );
  return true;
}

// The side panel's own keyboard shortcut (SIDE_PANEL_COMMAND). The key
// press allows opening the panel only until the first await.
export function handleSidePanelCommand(command: string, tab?: chrome.tabs.Tab) {
  if (command === SIDE_PANEL_COMMAND) openSidePanel(tab?.windowId);
}

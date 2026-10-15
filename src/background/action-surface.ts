import { getBrowserApi } from "../shared/browser-api";
import { openSetup } from "../shared/setup-progress";
import { openOrFocusUrl } from "../shared/tab-navigation";
import { knownSetupFinished, setupFinished } from "./setup-gate";

const SIDE_PANEL_PAGE = "/sidepanel.html";

type BrowserWithSidebar = typeof chrome & {
  sidebarAction?: {
    open?: () => Promise<void>;
    toggle?: () => Promise<void>;
  };
};

// Every way into the side panel goes through here: until setup is finished
// (setup-gate.ts) they open the guided setup instead.

// The toolbar button and its shortcut. Chromium opens the side panel itself
// once setup is finished (openPanelOnActionClick), so a click comes here
// before that; Firefox toggles its sidebar; elsewhere the panel page opens
// as a tab.
export async function openActionSurface(tab?: chrome.tabs.Tab) {
  const api = getBrowserApi() as BrowserWithSidebar;
  // Known finished: open in the click's gesture, before any await.
  if (knownSetupFinished()) return openPanel(api, tab?.windowId, true);
  if (!(await setupFinished())) return openSetup();
  return openPanel(api, tab?.windowId, true);
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
  openPanel(getBrowserApi() as BrowserWithSidebar, windowId, false)?.catch(
    (error: unknown) => console.warn("Failed to open the side panel", error),
  );
  return true;
}

// `toggle`: the toolbar button closes Firefox's sidebar again.
function openPanel(
  api: BrowserWithSidebar,
  windowId: number | undefined,
  toggle: boolean,
) {
  if (api.sidePanel?.open && windowId !== undefined)
    return api.sidePanel.open({ windowId });
  if (toggle && api.sidebarAction?.toggle) return api.sidebarAction.toggle();
  if (api.sidebarAction?.open) return api.sidebarAction.open();
  return focusSidePanelTab();
}

function focusSidePanelTab() {
  return openOrFocusUrl(getBrowserApi().runtime.getURL(SIDE_PANEL_PAGE));
}

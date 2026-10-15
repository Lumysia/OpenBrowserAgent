import { getBrowserApi } from "../shared/browser-api";
import { openOrFocusUrl } from "../shared/tab-navigation";

const SIDE_PANEL_PAGE = "/sidepanel.html";

type BrowserWithSidebar = typeof chrome & {
  sidebarAction?: {
    open?: () => Promise<void>;
    toggle?: () => Promise<void>;
  };
};

// The toolbar button: Chromium opens the side panel itself
// (openPanelOnActionClick); Firefox toggles its sidebar; elsewhere the
// panel page opens as a tab.
export async function openActionSurface() {
  const api = getBrowserApi() as BrowserWithSidebar;
  if (api.sidePanel) return;
  if (api.sidebarAction?.toggle) return api.sidebarAction.toggle();
  await focusSidePanelTab();
}

// Opens the side panel for page UI. Call it before any await in a message
// listener: Chromium and Firefox only open it during the user's gesture.
export function openSidePanel(windowId: number | undefined) {
  const api = getBrowserApi() as BrowserWithSidebar;
  if (api.sidePanel?.open && windowId !== undefined)
    return api.sidePanel.open({ windowId });
  if (api.sidebarAction?.open) return api.sidebarAction.open();
  return focusSidePanelTab();
}

function focusSidePanelTab() {
  return openOrFocusUrl(getBrowserApi().runtime.getURL(SIDE_PANEL_PAGE));
}

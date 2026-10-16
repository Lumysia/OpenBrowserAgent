import { getBrowserApi } from "./browser-api";
import { openOrFocusUrl } from "./tab-navigation";

export const SIDE_PANEL_PAGE = "/sidepanel.html";

// The toolbar button's menu (entrypoints/menu), set as its popup once setup
// is finished.
export const TOOLBAR_MENU_PAGE = "/menu.html";

type BrowserWithSidebar = typeof chrome & {
  sidebarAction?: {
    open?: () => Promise<void>;
    toggle?: () => Promise<void>;
  };
};

// Opens the side panel in `windowId`: Chromium's side panel, Firefox's
// sidebar (`toggle` closes it again when it is open), and where the browser
// has neither (Safari) the panel page in a tab. Browsers open a panel only
// during the user's gesture: call this before any await.
export function openSidePanelIn(
  windowId: number | undefined,
  { toggle = false }: { toggle?: boolean } = {},
): Promise<unknown> {
  const api = getBrowserApi() as BrowserWithSidebar;
  if (api.sidePanel?.open && windowId !== undefined)
    return api.sidePanel.open({ windowId });
  if (toggle && api.sidebarAction?.toggle) return api.sidebarAction.toggle();
  if (api.sidebarAction?.open) return api.sidebarAction.open();
  return openOrFocusUrl(api.runtime.getURL(SIDE_PANEL_PAGE));
}

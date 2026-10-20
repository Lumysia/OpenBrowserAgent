import {
  leaveSidePanelHandoff,
  type SidePanelHandoffRequest,
} from "../shared/side-panel-handoff";
import { openSidePanel } from "./action-surface";

// Opens the side panel of the tab's window, then leaves the request where
// the panel picks it up; before setup is finished, setup opens instead and
// the request is dropped. Call it before any await in a click or message
// listener: the panel only opens during the user's gesture.
export function handOffToSidePanel(
  tab: chrome.tabs.Tab | undefined,
  request: SidePanelHandoffRequest,
) {
  const windowId = tab?.windowId;
  if (!openSidePanel(windowId)) return Promise.resolve();
  return leaveSidePanelHandoff(request, {
    windowId,
    tabId: tab?.id,
    pageTitle: tab?.title,
    pageUrl: tab?.url,
  });
}

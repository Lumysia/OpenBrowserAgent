import {
  sidePanelHandoffStorage,
  type SidePanelHandoff,
  type SidePanelHandoffRequest,
} from "../shared/side-panel-handoff";
import { openSidePanel } from "./action-surface";

// Opens the side panel of the tab's window, then leaves the request where
// the panel picks it up. Call it before any await in a click or message
// listener: the panel only opens during the user's gesture.
export function handOffToSidePanel(
  tab: chrome.tabs.Tab | undefined,
  request: SidePanelHandoffRequest,
) {
  const windowId = tab?.windowId;
  const opened = new Promise((resolve) =>
    resolve(openSidePanel(windowId)),
  ).catch((error) => console.warn("Failed to open the side panel", error));
  const handoff: SidePanelHandoff = {
    ...request,
    id: crypto.randomUUID(),
    windowId,
    tabId: tab?.id,
    pageTitle: tab?.title,
    pageUrl: tab?.url,
    createdAt: Date.now(),
  };
  const { area, key } = sidePanelHandoffStorage();
  return Promise.all([opened, area.set({ [key]: handoff })]).then(
    () => undefined,
  );
}

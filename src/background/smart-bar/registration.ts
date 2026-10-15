import {
  normalizeSmartBarSettings,
  smartBarMatchPatterns,
} from "../../shared/smart-bar";
import { getBrowserApi } from "../../shared/browser-api";
import { PAGE_SCRIPT, REGISTERED_SCRIPT_ID } from "../../shared/page-scripts";
import {
  injectContentScript,
  registerWhile,
  type ContentScript,
} from "../content-script-registration";

// Every frame, also frames without their own origin (about:blank editor
// frames), only on the sites the bar may run on.
const TRIGGER_SCRIPT: ContentScript = {
  id: REGISTERED_SCRIPT_ID.smartBar,
  file: PAGE_SCRIPT.smartBar,
  allFrames: true,
  matchOriginAsFallback: true,
};

export function registerSmartBarTrigger() {
  registerWhile(TRIGGER_SCRIPT, (preferences) =>
    smartBarMatchPatterns(normalizeSmartBarSettings(preferences.smartBar)),
  );
}

// The page script guards against running twice in a frame.
export function injectTrigger(tabId: number) {
  return injectContentScript(tabId, TRIGGER_SCRIPT);
}

export function injectUi(tabId: number, frameId: number) {
  return getBrowserApi().scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    files: [PAGE_SCRIPT.smartBarUi],
  });
}

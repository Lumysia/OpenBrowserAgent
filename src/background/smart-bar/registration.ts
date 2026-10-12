import {
  isSmartBarAllowedOnHost,
  smartBarMatchPatterns,
  type SmartBarSettings,
} from "../../shared/smart-bar";
import { SMART_BAR_SCRIPT } from "../../shared/smart-bar-protocol";
import { getBrowserApi } from "../../shared/storage";

const SCRIPT_ID = "oba-smart-bar";

type RegisteredScript = chrome.scripting.RegisteredContentScript;

// The page script is registered only while the smart bar is on, and only for
// the sites it may run on, so pages pay nothing otherwise. Browsers without
// dynamic registration get no smart bar.
export async function syncSmartBarRegistration(settings: SmartBarSettings) {
  const scripting = getBrowserApi().scripting;
  if (!scripting?.registerContentScripts) return;
  const patterns = smartBarMatchPatterns(settings);
  const [existing] = await scripting.getRegisteredContentScripts({
    ids: [SCRIPT_ID],
  });
  if (!patterns) {
    if (existing)
      await scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  const script: RegisteredScript = {
    id: SCRIPT_ID,
    js: [SMART_BAR_SCRIPT.trigger],
    matches: patterns.matches,
    excludeMatches: patterns.excludeMatches,
    allFrames: true,
    runAt: "document_idle",
    persistAcrossSessions: true,
  };
  if (existing && samePatterns(existing, script)) return;
  if (existing) await scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  await registerScript(script);
  // Registration covers pages loaded from now on; open pages get it here.
  await injectIntoOpenTabs(settings);
}

async function registerScript(script: RegisteredScript) {
  const scripting = getBrowserApi().scripting;
  try {
    // Also frames without their own origin (about:blank editor frames).
    await scripting.registerContentScripts([
      { ...script, matchOriginAsFallback: true },
    ]);
  } catch {
    await scripting.registerContentScripts([script]);
  }
}

function samePatterns(a: RegisteredScript, b: RegisteredScript) {
  const key = (script: RegisteredScript) =>
    JSON.stringify([
      [...(script.matches || [])].sort(),
      [...(script.excludeMatches || [])].sort(),
      script.js,
    ]);
  return key(a) === key(b);
}

async function injectIntoOpenTabs(settings: SmartBarSettings) {
  const api = getBrowserApi();
  const tabs = await api.tabs.query({});
  await Promise.all(
    tabs.map((tab) => {
      const host = pageHost(tab.url);
      if (!tab.id || !host || !isSmartBarAllowedOnHost(settings, host))
        return undefined;
      return injectTrigger(tab.id);
    }),
  );
}

// The page script guards against running twice in a frame.
export function injectTrigger(tabId: number) {
  return getBrowserApi()
    .scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [SMART_BAR_SCRIPT.trigger],
    })
    .then(
      () => true,
      () => false,
    );
}

export function injectUi(tabId: number, frameId: number) {
  return getBrowserApi().scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    files: [SMART_BAR_SCRIPT.ui],
  });
}

// Web pages only: extension pages, browser pages, the PDF viewer and the
// stores cannot be scripted.
export function pageHost(url: string | undefined) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.hostname
      : undefined;
  } catch {
    return undefined;
  }
}

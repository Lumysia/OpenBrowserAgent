import {
  smartBarMatchPatterns,
  smartBarPatternsCover,
  type SmartBarSettings,
} from "../../shared/smart-bar";
import { SMART_BAR_SCRIPT } from "../../shared/smart-bar-protocol";
import { getBrowserApi } from "../../shared/browser-api";

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
  // Updated in place: a page loading meanwhile gets the old or the new
  // registration, never none.
  if (existing)
    await scripting.updateContentScripts([
      { ...script, matchOriginAsFallback: existing.matchOriginAsFallback },
    ]);
  else await registerScript(script);
  // Registration covers pages loaded from now on; open pages of newly
  // covered sites get the script here. That includes every covered page after
  // an extension update or reload: the browser drops the registration then,
  // and the old page scripts are cut off.
  await injectIntoOpenTabs(
    (host) =>
      smartBarPatternsCover(patterns, host) &&
      !(existing && smartBarPatternsCover(existing, host)),
  );
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

async function injectIntoOpenTabs(covers: (host: string) => boolean) {
  const tabs = await getBrowserApi().tabs.query({});
  await Promise.all(
    tabs.map((tab) => {
      const host = pageHost(tab.url);
      return tab.id && host && covers(host) ? injectTrigger(tab.id) : undefined;
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

import { getBrowserApi } from "../shared/browser-api";
import {
  pageHost,
  patternsCover,
  type SiteMatchPatterns,
} from "../shared/site-hosts";
import { storage } from "../shared/storage";
import type { Preferences } from "../shared/types";

type RegisteredScript = chrome.scripting.RegisteredContentScript;

// A page script registered only while a setting turns it on, so pages pay
// nothing otherwise. Browsers without dynamic registration don't get it.
export type ContentScript = {
  id: string;
  // The built script (see the entrypoint's `registration: "runtime"`).
  file: string;
  // Every frame, or the top frame only.
  allFrames: boolean;
  // Also frames without their own origin (about:blank editor frames), where
  // the browser supports it.
  matchOriginAsFallback?: boolean;
  // When it runs: once the page has loaded (the default), or before the
  // page's own scripts.
  runAt?: "document_start" | "document_idle";
  // The page's own world instead of the extension's isolated one.
  world?: "MAIN";
};

// Registers `script` for `patterns`, or unregisters it when they are
// undefined. Registration covers pages loaded from now on; open pages it
// newly covers get the script here. That includes every covered page after
// an extension update or reload: the browser drops the registration then,
// and the old page scripts are cut off. Page scripts guard against running
// twice, and leave by themselves when their setting turns them off.
export async function syncContentScript(
  script: ContentScript,
  patterns: SiteMatchPatterns | undefined,
) {
  const scripting = getBrowserApi().scripting;
  if (!scripting?.registerContentScripts) return;
  const [existing] = await scripting.getRegisteredContentScripts({
    ids: [script.id],
  });
  if (!patterns) {
    if (existing)
      await scripting.unregisterContentScripts({ ids: [script.id] });
    return;
  }
  const registered: RegisteredScript = {
    id: script.id,
    js: [script.file],
    matches: patterns.matches,
    excludeMatches: patterns.excludeMatches,
    allFrames: script.allFrames,
    runAt: script.runAt ?? "document_idle",
    ...(script.world && { world: script.world }),
    persistAcrossSessions: true,
  };
  if (existing && samePatterns(existing, registered)) return;
  // Updated in place: a page loading meanwhile gets the old or the new
  // registration, never none.
  if (existing)
    await scripting.updateContentScripts([
      { ...registered, matchOriginAsFallback: existing.matchOriginAsFallback },
    ]);
  else await register(registered, script.matchOriginAsFallback === true);
  const tabs = await getBrowserApi().tabs.query({});
  await Promise.all(
    tabs.map((tab) => {
      const host = pageHost(tab.url);
      const covered =
        tab.id !== undefined &&
        !!host &&
        patternsCover(patterns, host) &&
        !(existing && patternsCover(existing, host));
      return covered ? injectContentScript(tab.id!, script) : undefined;
    }),
  );
}

// Keeps `script` registered where `patterns` says for the stored
// preferences: once when the background starts, again on each change, one
// change at a time.
export function registerWhile(
  script: ContentScript,
  patterns: (preferences: Preferences) => SiteMatchPatterns | undefined,
) {
  let queue = Promise.resolve();
  const sync = (preferences: Preferences) => {
    queue = queue
      .then(() => syncContentScript(script, patterns(preferences)))
      .catch((error) =>
        console.warn(`Registering the ${script.id} script failed`, error),
      );
  };
  void storage.preferences.get().then(sync);
  storage.preferences.watch(sync);
}

// Injects `script` into an open tab's frames; false where the page can't
// be scripted.
export function injectContentScript(tabId: number, script: ContentScript) {
  return getBrowserApi()
    .scripting.executeScript({
      target: script.allFrames ? { tabId, allFrames: true } : { tabId },
      files: [script.file],
      ...(script.world && { world: script.world }),
    })
    .then(
      () => true,
      () => false,
    );
}

async function register(script: RegisteredScript, originFallback: boolean) {
  const scripting = getBrowserApi().scripting;
  if (originFallback)
    try {
      await scripting.registerContentScripts([
        { ...script, matchOriginAsFallback: true },
      ]);
      return;
    } catch {
      // Not supported here: registered without it.
    }
  await scripting.registerContentScripts([script]);
}

function samePatterns(a: RegisteredScript, b: RegisteredScript) {
  const key = (script: RegisteredScript) =>
    JSON.stringify([
      [...(script.matches || [])].sort(),
      [...(script.excludeMatches || [])].sort(),
      script.js,
      !!script.allFrames,
      script.runAt ?? "document_idle",
      script.world ?? "ISOLATED",
    ]);
  return key(a) === key(b);
}

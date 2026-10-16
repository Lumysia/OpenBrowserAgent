import { getBrowserApi } from "../../shared/browser-api";
import {
  PAGE_SCRIPT,
  REGISTERED_SCRIPT_ID,
  RETIRED_SCRIPT_IDS,
} from "../../shared/page-scripts";
import { normalizePageTranslateSettings } from "../../shared/page-translate/settings";
import { webPagesExcept } from "../../shared/site-hosts";
import type { Preferences } from "../../shared/types";
import {
  registerWhile,
  type ContentScript,
} from "../content-script-registration";

// While "Translate video subtitles automatically" is on, every frame of every page gets
// the subtitle script and the caption observer before the page's own
// scripts, so the first caption file a player loads is seen (videos are
// often embedded, also from other sites, so all frames, and frames without
// their own origin where the browser supports it). Where the browser can't register them,
// the menu and "Translate this page" still translate subtitles.
export const VIDEO_SUBTITLE_SCRIPTS: ContentScript[] = [
  {
    id: REGISTERED_SCRIPT_ID.videoSubtitles,
    file: PAGE_SCRIPT.videoSubtitles,
    allFrames: true,
    matchOriginAsFallback: true,
    runAt: "document_start",
  },
  {
    id: REGISTERED_SCRIPT_ID.captionObserver,
    file: PAGE_SCRIPT.captionObserver,
    allFrames: true,
    matchOriginAsFallback: true,
    runAt: "document_start",
    world: "MAIN",
  },
];

export function registerVideoSubtitles() {
  const patterns = (preferences: Preferences) =>
    normalizePageTranslateSettings(preferences.pageTranslate).videoSubtitles
      ? webPagesExcept([])
      : undefined;
  for (const script of VIDEO_SUBTITLE_SCRIPTS) registerWhile(script, patterns);
  void unregisterRetired();
}

async function unregisterRetired() {
  const scripting = getBrowserApi().scripting;
  if (!scripting?.getRegisteredContentScripts) return;
  const ids = (
    await scripting
      .getRegisteredContentScripts({ ids: [...RETIRED_SCRIPT_IDS] })
      .catch(() => [])
  ).map((script) => script.id);
  if (ids.length)
    await scripting.unregisterContentScripts({ ids }).catch(() => undefined);
}

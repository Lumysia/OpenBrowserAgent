// The per-page switches the toolbar button's right-click menu and the side
// panel's "This page" strip show: translate the page, "Translate into", the
// translate button and the smart bar on this site, and subtitles when the
// page has a video. Both read the same state from the background and send
// the same changes; the site switches write the existing site lists.
import {
  hidePageButtonOnHost,
  isPageButtonShownOn,
  normalizePageTranslateSettings,
  showPageButtonOnHost,
  translateIntoLanguage,
} from "./page-translate/settings";
import {
  hideSmartBarOnHost,
  isSmartBarOnHost,
  normalizeSmartBarSettings,
  showSmartBarOnHost,
} from "./smart-bar";
import type { Preferences } from "./types";

// Side panel -> background (runtime.sendMessage), and background -> side
// panel when the state of a tab may have changed.
export const PAGE_TOOLS_MESSAGE = {
  // Answers PageToolsState for `tabId`.
  state: "page-tools:state",
  // Applies a PageToolChange to `tabId`. Answers the new PageToolsState.
  change: "page-tools:change",
  // Background -> extension pages: read the state again.
  changed: "page-tools:changed",
} as const;

export type PageToolsState = {
  // The page's host; undefined where the page isn't a web page (browser
  // pages, the new tab page): then nothing applies.
  host?: string;
  translated: boolean;
  // The stored "Translate into" ("" follows the extension's language), and
  // the language that means.
  targetLanguage: string;
  resolvedTarget: string;
  // Shown on this site. Unavailable while the button is off everywhere
  // (turned on again in Settings only).
  pageButton: { on: boolean; available: boolean };
  smartBar: boolean;
  // A video at a usable size in some frame, and whether its subtitles are
  // translated.
  video: boolean;
  subtitles: boolean;
};

export type PageToolChange =
  | { tool: "translate" }
  | { tool: "targetLanguage"; language: string }
  | { tool: "pageButton"; on: boolean }
  | { tool: "smartBar"; on: boolean }
  | { tool: "subtitles"; on: boolean };

export type PageToolsStateMessage = {
  type: typeof PAGE_TOOLS_MESSAGE.state;
  tabId: number;
};

export type PageToolsChangeMessage = {
  type: typeof PAGE_TOOLS_MESSAGE.change;
  tabId: number;
  change: PageToolChange;
};

export function pageToolsState({
  host,
  preferences,
  uiLanguage,
  translated,
  video,
  subtitles,
}: {
  host: string | undefined;
  preferences: Preferences;
  uiLanguage: string;
  translated: boolean;
  video: boolean;
  subtitles: boolean;
}): PageToolsState {
  const pageTranslate = normalizePageTranslateSettings(
    preferences.pageTranslate,
  );
  const smartBar = normalizeSmartBarSettings(preferences.smartBar);
  return {
    host,
    translated: !!host && translated,
    targetLanguage: pageTranslate.targetLanguage,
    resolvedTarget: translateIntoLanguage(pageTranslate, uiLanguage),
    pageButton: {
      on: !!host && isPageButtonShownOn(pageTranslate, host),
      available: !!host && pageTranslate.pageButton,
    },
    smartBar: !!host && isSmartBarOnHost(smartBar, host),
    video: !!host && video,
    subtitles: !!host && video && subtitles,
  };
}

// The preferences after a settings change (the site switches and "Translate
// into"); undefined for changes that act on the page instead, and for site
// switches where the page has no site.
export function applyPageToolSetting(
  preferences: Preferences,
  host: string | undefined,
  change: PageToolChange,
): Preferences | undefined {
  const pageTranslate = normalizePageTranslateSettings(
    preferences.pageTranslate,
  );
  switch (change.tool) {
    case "targetLanguage":
      return {
        ...preferences,
        pageTranslate: { ...pageTranslate, targetLanguage: change.language },
      };
    case "pageButton":
      if (!host) return undefined;
      return {
        ...preferences,
        pageTranslate: change.on
          ? showPageButtonOnHost(pageTranslate, host)
          : hidePageButtonOnHost(pageTranslate, host),
      };
    case "smartBar": {
      if (!host) return undefined;
      const smartBar = normalizeSmartBarSettings(preferences.smartBar);
      return {
        ...preferences,
        smartBar: change.on
          ? showSmartBarOnHost(smartBar, host)
          : hideSmartBarOnHost(smartBar, host),
      };
    }
    default:
      return undefined;
  }
}

// The per-page tools the toolbar menu shows for the active tab: translate
// the page, the smart bar on this site, and subtitles when the page has a
// video. The menu reads their state from the background and sends changes
// there; the smart bar switch writes the existing site lists.
import {
  hideSmartBarOnHost,
  isSmartBarOnHost,
  normalizeSmartBarSettings,
  showSmartBarOnHost,
} from "./smart-bar";
import type { Preferences } from "./types";

// Toolbar menu -> background (runtime.sendMessage), and background ->
// extension pages when the state of a tab may have changed.
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
  smartBar: boolean;
  // A video at a usable size in some frame, and whether its subtitles are
  // translated.
  video: boolean;
  subtitles: boolean;
};

export type PageToolChange =
  | { tool: "translate" }
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
  translated,
  video,
  subtitles,
}: {
  host: string | undefined;
  preferences: Preferences;
  translated: boolean;
  video: boolean;
  subtitles: boolean;
}): PageToolsState {
  const smartBar = normalizeSmartBarSettings(preferences.smartBar);
  return {
    host,
    translated: !!host && translated,
    smartBar: !!host && isSmartBarOnHost(smartBar, host),
    video: !!host && video,
    subtitles: !!host && video && subtitles,
  };
}

// The preferences after a settings change (the smart bar on this site);
// undefined for changes that act on the page instead, and where the page
// has no site.
export function applyPageToolSetting(
  preferences: Preferences,
  host: string | undefined,
  change: PageToolChange,
): Preferences | undefined {
  if (change.tool !== "smartBar" || !host) return undefined;
  const smartBar = normalizeSmartBarSettings(preferences.smartBar);
  return {
    ...preferences,
    smartBar: change.on
      ? showSmartBarOnHost(smartBar, host)
      : hideSmartBarOnHost(smartBar, host),
  };
}

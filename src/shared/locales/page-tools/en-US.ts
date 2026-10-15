// The per-page switches: the toolbar button's right-click menu and the side
// panel's "This page" strip.
export const pageToolsEnUS = {
  title: "This page",
  show: "Show page tools",
  hide: "Hide page tools",
  // The toolbar button menu's submenu; {language}: the current choice.
  translateInto: "Translate into: {language}",
  pageButton: "Translate button on this site",
  // Why the switch is unavailable.
  pageButtonOff:
    "The translate button is off everywhere. Turn it on in Settings.",
  smartBar: "Smart bar on this site",
  subtitles: "Translated subtitles for this video",
};

export type PageToolsLocaleMessages = typeof pageToolsEnUS;

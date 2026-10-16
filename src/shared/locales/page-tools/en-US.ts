// The toolbar menu (the toolbar button's popup): the active page's tools.
export const pageToolsEnUS = {
  // The menu's heading where the page has no site (browser pages, the new
  // tab page), and why its tools are unavailable there.
  notWebPage: "Not a web page",
  notWebPageReason: "Works on web pages only",
  // The tiles' short labels; their tooltips say what each does.
  translate: "Translate",
  smartBarLabel: "Smart bar",
  subtitlesLabel: "Subtitles",
  smartBar: "Smart bar on this site",
  subtitles: "Translated subtitles for this video",
  // Why the subtitles tile is unavailable on a web page.
  noVideo: "No video on this page",
  // {language}: the language picker.
  translateInto: "Translate into: {language}",
};

export type PageToolsLocaleMessages = typeof pageToolsEnUS;

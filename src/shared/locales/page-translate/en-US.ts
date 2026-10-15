export const pageTranslateEnUS = {
  menu: {
    translatePage: "Translate this page",
    showOriginal: "Show original",
  },
  // The context menu settings' row for the item.
  menuItemLabel: "Translate this page / Show original",
  settingsTitle: "Page translation",
  settingsDescription:
    'Translate a page with the button on its edge, the keyboard shortcut or "Translate this page" in the right-click menu. Do the same again to show the original.',
  engine: "Translation engine",
  engineDescription: "Choose what translates pages.",
  engines: {
    model: "AI model",
    browser: "Built-in translator (on device)",
    google: "Google Translate (free)",
    microsoft: "Microsoft Translator (free)",
  },
  engineDetails: {
    model:
      "Your AI provider translates pages with the Translation model set in AI providers & models.",
    browser:
      "The browser translates on this device; no text leaves it. Each language is downloaded once. Where it can't translate a page, the AI model below does.",
    google:
      "An unofficial free service, not a Google API. It can stop working at any time.",
    microsoft:
      "An unofficial free service, not a Microsoft API. It can stop working at any time.",
  },
  // Shown while Google or Microsoft is selected.
  cloudNotice: {
    google:
      "Page text is sent to Google to translate it. If Google fails on a page, Microsoft translates the rest of it.",
    microsoft:
      "Page text is sent to Microsoft to translate it. If Microsoft fails on a page, Google translates the rest of it.",
  },
  // Engine names inside sentences (the notes below).
  engineNames: {
    model: "the AI model",
    browser: "the built-in translator",
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "Privacy policy",
  modelDescription: "The model that translates pages.",
  targetLanguage: "Translate into",
  targetLanguageDescription:
    "Pages are translated into this language. It doesn't change the extension's language.",
  // {language}: the extension's language.
  followInterface: "Extension's language ({language})",
  display: "Display",
  displayDescription:
    "Original and translation keeps each paragraph and adds the translation under it.",
  displayModes: {
    bilingual: "Original and translation",
    translation: "Translation only",
  },
  translateMenus: "Also translate menus and buttons",
  translateMenusDescription:
    "When off, the short labels of the page's navigation, menus, buttons, tabs and footers stay as they are; headings, sentences and questions in them are still translated.",
  cache: "Saved translations",
  cacheDescription:
    "Translations are kept on this device for 30 days, so translated pages come back at once.",
  clearCache: "Clear saved translations",
  cacheCleared: "Saved translations cleared.",
  clearCacheFailed: "Couldn't clear saved translations",
  // Notes on the page. {engine}: the engine's name.
  errors: {
    unavailable:
      "{engine} isn't available. Check page translation in Settings.",
    rateLimited:
      "{engine} is limiting requests from this network. Try again later or choose another engine in Settings.",
    refused:
      "{engine} refused to translate. Choose another engine in Settings.",
    network: "Couldn't reach {engine}. Check your connection and try again.",
    failed: "Some paragraphs couldn't be translated by {engine}.",
    allFailed:
      "Neither {engine} nor {fallback} could translate this page. Try again later or choose another engine in Settings.",
  },
  // {engine}: the engine that failed; {fallback}: the one used instead.
  switched: {
    rateLimited:
      "Switched to {fallback} for this page: {engine} is limiting requests.",
    failed:
      "Switched to {fallback} for this page: {engine} isn't working right now.",
    unavailable:
      "Switched to {fallback} for this page: {engine} can't translate it here.",
  },
  // Below the engine choice where the browser has no built-in translator.
  browserMissing:
    "This browser has no built-in translator, so the AI model below translates pages.",
  // The page script was injected but didn't answer.
  notStarted:
    "Couldn't start translating this page. Reload the page and try again.",
  unavailablePage:
    "Can't translate this page: the browser doesn't let extensions change it.",
  // The button on an edge of the page and its close control's menu.
  button: {
    translating: "Translating…",
    hide: "Hide translate button",
    // {site}: the page's host.
    hideOnSite: "Hide on {site}",
    hideEverywhere: "Hide everywhere",
    // Settings.
    setting: "Translate button on pages",
    settingDescription:
      "A small button on the edge of web pages translates the page or shows the original. Drag it to move it; it stays on the nearest edge of the window.",
    // Its accessible description, for the keyboard.
    move: "Arrow keys move it along the edge; E moves it to the next edge.",
    hiddenSites: "Hidden on these sites",
    hiddenSitesDescription:
      "The button doesn't show on these sites. A site includes its subdomains.",
  },
  // Video subtitles: the original line with its translation under it.
  subtitles: {
    // The right-click menu item on a video; it also hides them again.
    menu: "Translate subtitles",
    // The context menu settings' row for the item.
    menuItemLabel: "Translate subtitles / Hide them (on videos)",
    noCaptions:
      "No subtitles found for this video yet. Turn on its captions in the player; they are translated as soon as they show.",
    liveOnly:
      "Translating the captions on screen as they show. To translate ahead, turn the player's captions off and on again.",
    noVideo: "No video to translate subtitles for here.",
    // Settings: subtitles start by themselves on every video.
    setting: "Translate video subtitles",
    settingDescription:
      'Videos with subtitles show each line with its translation under it by themselves, on every site. "Translate subtitles" in a video\'s right-click menu turns them off or on for that video. When this is off, the menu and "Translate this page" still translate them.',
  },
};

export type PageTranslateLocaleMessages = typeof pageTranslateEnUS;

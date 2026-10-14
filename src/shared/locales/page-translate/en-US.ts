export const pageTranslateEnUS = {
  menu: {
    translatePage: "Translate this page",
    showOriginal: "Show original",
  },
  // The context menu settings' row for the item.
  menuItemLabel: "Translate this page / Show original",
  settingsTitle: "Page translation",
  settingsDescription:
    'Choose "Translate this page" in the right-click menu to translate a page, and "Show original" to go back.',
  engine: "Translation engine",
  engineDescription: "Choose what translates pages.",
  engines: {
    model: "AI model",
    browser: "Built-in translator (on device)",
    google: "Google Translate (free)",
    microsoft: "Microsoft Translator (free)",
  },
  engineDetails: {
    model: "Your AI provider translates pages with the model chosen below.",
    browser:
      "The browser translates on this device; no text leaves it. Each language is downloaded once.",
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
  freeServices: {
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "Privacy policy",
  model: "Model",
  modelDescription: "The model that translates pages.",
  defaultModel: "Same model as the chat",
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
      "{engine} and {fallback} both failed to translate. Try again later or choose another engine in Settings.",
  },
  // {engine}: the service that failed; {fallback}: the one used instead.
  switched: {
    rateLimited:
      "{engine} is limiting requests; switched to {fallback} for this page.",
    failed:
      "{engine} isn't working right now; switched to {fallback} for this page.",
  },
  // {language}: the target language.
  browserUnsupported:
    "The built-in translator can't translate this page into {language}.",
  // The page script was injected but didn't answer.
  notStarted:
    "Couldn't start translating this page. Reload the page and try again.",
  unavailablePage:
    "Can't translate this page: the browser doesn't let extensions change it.",
};

export type PageTranslateLocaleMessages = typeof pageTranslateEnUS;

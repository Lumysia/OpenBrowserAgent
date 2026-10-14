export const pageTranslateEnUS = {
  menu: {
    translatePage: "Translate this page",
    showOriginal: "Show original",
  },
  // The context menu settings' row for the item.
  menuItemLabel: "Translate this page / Show original",
  settingsTitle: "Page translation",
  settingsDescription:
    'Translate whole pages from the right-click menu: choose "Translate this page", and "Show original" to go back.',
  engine: "Translation engine",
  engineDescription:
    "Where translations come from. Translations are saved on this device, so pages you translated before come back at once.",
  engines: {
    model: "AI model",
    browser: "Built-in translator (on device)",
    google: "Google Translate (free)",
    microsoft: "Microsoft Translator (free)",
  },
  engineDetails: {
    model:
      "Your configured AI provider translates, with the model you pick below.",
    browser:
      "The browser translates on this device; no text leaves it. Each language is downloaded once.",
    google:
      "An unofficial free service, not a Google API. It can stop working at any time.",
    microsoft:
      "An unofficial free service, not a Microsoft API. It can stop working at any time.",
  },
  // Shown while Google or Microsoft is selected.
  cloudNotice: {
    google: "Page text is sent to Google to translate it.",
    microsoft: "Page text is sent to Microsoft to translate it.",
  },
  privacyLink: "Privacy policy",
  model: "Model",
  modelDescription: "The model that translates pages.",
  defaultModel: "Chat's selected model",
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
  },
  noModel: "No AI model is set up. Add a provider in Settings.",
  // {language}: the target language.
  browserUnsupported:
    "The built-in translator can't translate this page into {language}.",
  unavailablePage:
    "Can't translate this page: the browser doesn't let extensions change it.",
};

export type PageTranslateLocaleMessages = typeof pageTranslateEnUS;

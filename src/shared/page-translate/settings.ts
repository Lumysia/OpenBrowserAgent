// Page translation settings. Dependency-free: the page script imports this
// module.
import { matchLanguageTag, normalizeLanguageTag } from "../language-tags";
import { PAGE_TRANSLATE_LANGUAGES } from "./languages";
import {
  hostListed,
  normalizeHostList,
  webPagesExcept,
  type SiteMatchPatterns,
} from "../site-hosts";
import { oneOf } from "../values";

// Where translations come from. `model`: the user's AI provider. `browser`:
// the browser's on-device translator (Chrome's Translator API). `google`
// and `microsoft`: the free web endpoints of those services.
export const PAGE_TRANSLATE_ENGINE = {
  model: "model",
  browser: "browser",
  google: "google",
  microsoft: "microsoft",
} as const;

export type PageTranslateEngine =
  (typeof PAGE_TRANSLATE_ENGINE)[keyof typeof PAGE_TRANSLATE_ENGINE];

export const PAGE_TRANSLATE_ENGINES = Object.values(PAGE_TRANSLATE_ENGINE);

// Engines that send page text to a third-party translation service.
export const FREE_CLOUD_ENGINES: readonly PageTranslateEngine[] = [
  PAGE_TRANSLATE_ENGINE.google,
  PAGE_TRANSLATE_ENGINE.microsoft,
];

// The engine a page continues with when its engine can't translate it: one
// free service hands over to the other, and the browser's translator (absent
// in this browser, or without the language pair) to the AI model.
export const PAGE_TRANSLATE_FALLBACK: Partial<
  Record<PageTranslateEngine, PageTranslateEngine>
> = {
  [PAGE_TRANSLATE_ENGINE.google]: PAGE_TRANSLATE_ENGINE.microsoft,
  [PAGE_TRANSLATE_ENGINE.microsoft]: PAGE_TRANSLATE_ENGINE.google,
  [PAGE_TRANSLATE_ENGINE.browser]: PAGE_TRANSLATE_ENGINE.model,
};

// `bilingual`: the translation under each paragraph. `translation`: only the
// translation where the page allows it (the original stays in the page).
export const PAGE_TRANSLATE_DISPLAY = {
  bilingual: "bilingual",
  translation: "translation",
} as const;

export type PageTranslateDisplay =
  (typeof PAGE_TRANSLATE_DISPLAY)[keyof typeof PAGE_TRANSLATE_DISPLAY];

export type PageTranslateSettings = {
  engine: PageTranslateEngine;
  // The AI engine's model; empty uses the chat's selected model.
  modelId: string;
  // A language tag; empty follows the extension's language.
  targetLanguage: string;
  display: PageTranslateDisplay;
  // Also translate the page's menus, buttons, tabs, navigation, sidebars
  // and footer; off translates the main content only.
  translateMenus: boolean;
  // A button on the corner of videos (on hover) that translates their
  // subtitles.
  videoButton: boolean;
  // A button on the page's right edge that translates the page or shows the
  // original, except on the sites listed (each with its subdomains).
  pageButton: boolean;
  pageButtonHiddenHosts: string[];
  // The keyboard shortcut (a browser command) for the same.
  shortcut: boolean;
};

// The browser's translator by default: where the browser has none, pages
// fall back to the AI model (PAGE_TRANSLATE_FALLBACK).
export const DEFAULT_PAGE_TRANSLATE_SETTINGS: PageTranslateSettings = {
  engine: PAGE_TRANSLATE_ENGINE.browser,
  modelId: "",
  targetLanguage: "",
  display: PAGE_TRANSLATE_DISPLAY.bilingual,
  translateMenus: false,
  videoButton: true,
  pageButton: true,
  pageButtonHiddenHosts: [],
  shortcut: true,
};

export function normalizePageTranslateSettings(
  value: Partial<PageTranslateSettings> | undefined,
): PageTranslateSettings {
  const engine = oneOf(
    PAGE_TRANSLATE_ENGINES,
    value?.engine,
    DEFAULT_PAGE_TRANSLATE_SETTINGS.engine,
  );
  const display = oneOf(
    Object.values(PAGE_TRANSLATE_DISPLAY),
    value?.display,
    DEFAULT_PAGE_TRANSLATE_SETTINGS.display,
  );
  const flag = (
    key: "translateMenus" | "videoButton" | "pageButton" | "shortcut",
  ) =>
    typeof value?.[key] === "boolean"
      ? value[key]
      : DEFAULT_PAGE_TRANSLATE_SETTINGS[key];
  return {
    engine,
    modelId: typeof value?.modelId === "string" ? value.modelId : "",
    targetLanguage:
      (typeof value?.targetLanguage === "string" &&
        normalizeLanguageTag(value.targetLanguage)) ||
      "",
    display,
    translateMenus: flag("translateMenus"),
    videoButton: flag("videoButton"),
    pageButton: flag("pageButton"),
    pageButtonHiddenHosts: normalizeHostList(value?.pageButtonHiddenHosts),
    shortcut: flag("shortcut"),
  };
}

// Where the page button's script is registered; undefined while it is off.
export function pageButtonMatchPatterns(
  settings: PageTranslateSettings,
): SiteMatchPatterns | undefined {
  return settings.pageButton
    ? webPagesExcept(settings.pageButtonHiddenHosts)
    : undefined;
}

export function isPageButtonShownOn(
  settings: PageTranslateSettings,
  host: string,
) {
  return (
    settings.pageButton && !hostListed(settings.pageButtonHiddenHosts, host)
  );
}

// "Hide on this site".
export function hidePageButtonOnHost(
  settings: PageTranslateSettings,
  host: string,
): PageTranslateSettings {
  return hostListed(settings.pageButtonHiddenHosts, host)
    ? settings
    : {
        ...settings,
        pageButtonHiddenHosts: [...settings.pageButtonHiddenHosts, host],
      };
}

// The language pages are translated into: the setting, else the extension's
// language, matched to a language the engines know.
export function pageTranslateTarget(
  settings: PageTranslateSettings,
  uiLanguage: string | undefined,
) {
  return (
    matchTargetLanguage(settings.targetLanguage) ||
    matchTargetLanguage(uiLanguage) ||
    "en"
  );
}

// The page translation language that serves `tag` best (see
// matchLanguageTag).
export function matchTargetLanguage(tag: string | undefined) {
  return matchLanguageTag(tag, PAGE_TRANSLATE_TAGS);
}

const PAGE_TRANSLATE_TAGS = PAGE_TRANSLATE_LANGUAGES.map(({ tag }) => tag);

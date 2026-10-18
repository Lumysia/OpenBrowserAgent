// Page translation settings. Dependency-free: the page script imports this
// module.
import { matchLanguageTag, normalizeLanguageTag } from "../language-tags";
import { PAGE_TRANSLATE_LANGUAGES } from "./languages";
import {
  hostListed,
  hostMatches,
  normalizeHostList,
  webPagesExcept,
  type SiteMatchPatterns,
} from "../site-hosts";
import { oneOf } from "../values";
import {
  DEFAULT_SUBTITLE_STYLE,
  normalizeSubtitleStyle,
  type SubtitleStyle,
} from "../video-subtitles/style";

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

// How pages translated with `engine` use the AI model (`modelId`): as the
// engine, as its fallback, or not at all. A page hands over once, so only
// the engine's own fallback counts.
export function pageTranslateModelUse(
  engine: PageTranslateEngine,
): "engine" | "fallback" | undefined {
  if (engine === PAGE_TRANSLATE_ENGINE.model) return "engine";
  if (PAGE_TRANSLATE_FALLBACK[engine] === PAGE_TRANSLATE_ENGINE.model)
    return "fallback";
  return undefined;
}

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
  // Translate the subtitles of every video that has them, on every site,
  // without being asked. Off: only the right-click menu and "Translate this
  // page" start them.
  videoSubtitles: boolean;
  // How translated subtitles look.
  subtitleStyle: SubtitleStyle;
  // A button on an edge of the page that translates the page or shows the
  // original, except on the sites listed (each with its subdomains).
  pageButton: boolean;
  pageButtonHiddenHosts: string[];
};

// The browser's translator by default: where the browser has none, pages
// fall back to the AI model (PAGE_TRANSLATE_FALLBACK).
export const DEFAULT_PAGE_TRANSLATE_SETTINGS: PageTranslateSettings = {
  engine: PAGE_TRANSLATE_ENGINE.browser,
  modelId: "",
  targetLanguage: "",
  display: PAGE_TRANSLATE_DISPLAY.bilingual,
  translateMenus: false,
  videoSubtitles: false,
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  pageButton: true,
  pageButtonHiddenHosts: [],
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
  const flag = (key: "translateMenus" | "videoSubtitles" | "pageButton") =>
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
    videoSubtitles: flag("videoSubtitles"),
    subtitleStyle: normalizeSubtitleStyle(value?.subtitleStyle),
    pageButton: flag("pageButton"),
    pageButtonHiddenHosts: normalizeHostList(value?.pageButtonHiddenHosts),
    // An older release's `shortcut` switch is left out: the browser's
    // shortcut settings turn the key off.
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

// The one "Translate into" language: pages, video subtitles and the smart
// bar's Translate and dictionary use it. The setting, else the extension's
// language, matched to a language the engines know.
export function translateIntoLanguage(
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

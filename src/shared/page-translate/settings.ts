// Page translation settings. Dependency-free: the page script imports this
// module.
import { normalizeLanguageTag } from "../language-tags";
import { PAGE_TRANSLATE_LANGUAGES } from "./languages";

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
};

export const DEFAULT_PAGE_TRANSLATE_SETTINGS: PageTranslateSettings = {
  engine: PAGE_TRANSLATE_ENGINE.model,
  modelId: "",
  targetLanguage: "",
  display: PAGE_TRANSLATE_DISPLAY.bilingual,
  translateMenus: false,
};

export function normalizePageTranslateSettings(
  value: Partial<PageTranslateSettings> | undefined,
): PageTranslateSettings {
  const engine = PAGE_TRANSLATE_ENGINES.includes(
    value?.engine as PageTranslateEngine,
  )
    ? (value?.engine as PageTranslateEngine)
    : DEFAULT_PAGE_TRANSLATE_SETTINGS.engine;
  const display = Object.values(PAGE_TRANSLATE_DISPLAY).includes(
    value?.display as PageTranslateDisplay,
  )
    ? (value?.display as PageTranslateDisplay)
    : DEFAULT_PAGE_TRANSLATE_SETTINGS.display;
  return {
    engine,
    modelId: typeof value?.modelId === "string" ? value.modelId : "",
    targetLanguage:
      (typeof value?.targetLanguage === "string" &&
        normalizeLanguageTag(value.targetLanguage)) ||
      "",
    display,
    translateMenus:
      typeof value?.translateMenus === "boolean"
        ? value.translateMenus
        : DEFAULT_PAGE_TRANSLATE_SETTINGS.translateMenus,
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

export function matchTargetLanguage(tag: string | undefined) {
  const normalized = normalizeLanguageTag(tag);
  if (!normalized) return undefined;
  const lower = normalized.toLowerCase();
  const exact = PAGE_TRANSLATE_LANGUAGES.find(
    (language) => language.tag.toLowerCase() === lower,
  );
  if (exact) return exact.tag;
  const [primary, ...rest] = lower.split("-");
  if (primary === "zh")
    return rest.some((part) => ["hant", "tw", "hk", "mo"].includes(part))
      ? "zh-TW"
      : "zh-CN";
  if (primary === "pt") return rest.includes("pt") ? "pt-PT" : "pt-BR";
  return PAGE_TRANSLATE_LANGUAGES.find(
    (language) => language.tag.toLowerCase() === primary,
  )?.tag;
}
